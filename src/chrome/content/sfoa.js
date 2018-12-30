const { Promise } = Components.utils.import('resource://gre/modules/Promise.jsm', {});

var sfoaListener = {
	newMessageSelected: function() {
		var context = {};
		return this.scanMessageForAppointment(context).then(function() {
			return;
		}).catch(function(e) {
			console.log(e)
		});
	},

	get selectedMessageURI() {
		return gFolderDisplay.selectedMessageUris[0];
	},

	// Load message headers
	ensureCurrentMessagePrepared: function(aContext) {
		if (aContext && aContext.headers) {
			return Promise.resolve(aContext);
		}

		aContext = aContext || {};
		let loader = new StreamMessageLoader(this.selectedMessageURI, aContext);
		return loader.loadHeaders();
	},

	// Load complete message
	ensureCurrentMessageLoaded : function(aContext) {
		if (aContext && aContext.message) {
			return Promise.resolve(aContext);
		}

		aContext = aContext || {};
		let loader = new StreamMessageLoader(this.selectedMessageURI, aContext);
		return loader.loadAll().then(function(aContext) {
			return aContext;
		});
	},

	MULTIPART_ALTERNATIVE_MATCHER : /^(Content-Type:\s*)multipart\/alternative(;\s*boundary=(['"]?)([^\s]+)\3)/im,

	scanMessageForAppointment: function(aContext) {
		return this.ensureCurrentMessagePrepared(aContext).then((aContext) => {
			// Get button in bar and hide if available
			var button = document.getElementById("outlook-appointment-button");
			if(button !== null) {
				button.style.display = "none";
			}
			// Get appointment indicator
			var elem = document.getElementById("outlook-appointment-outer");
			elem.style.display = "none";
			
			if (!this.MULTIPART_ALTERNATIVE_MATCHER.test(aContext.headers)) {
				console.log("SFOA: No alternative part found");
				return false;
			}

			return this.ensureCurrentMessageLoaded(aContext).then((aContext) => {
				var bodies = this.collectSameTypeBodies(aContext.message);
				
				if(bodies["text/calendar;"] !== undefined) {
					console.log("SFOA: Alternative part and calendar entry found");

					// Get calendar entry and reformat to ICS text
					var calendarEntry = bodies["text/calendar;"][0];
					// Remove \r line breaks
					calendarEntry = calendarEntry.replace(/\r/g, "");
					// Split by line
					calendarEntry = calendarEntry.split("\n");
					// Remove first three lines
					calendarEntry.shift();
					calendarEntry.shift();
					calendarEntry.shift();
					// Remove last three lines
					calendarEntry.pop();
					calendarEntry.pop();
					calendarEntry.pop();
					// Join lines and convert BASE64 to text
					calendarEntry = calendarEntry.join("");
					calendarEntry = atob(calendarEntry);

					// Show indicator and button if available
					elem.style.display = "block";
					if(button !== null) {
						button.style.display = "block";
					}

					// Download ics file to tmp dir
					var download = function(e) {
						// Only left clicks
						if(e.which === 1) {
							var url = "data:text/calendar;charset=utf8," + escape(calendarEntry);
							const {Downloads} = Cu.import("resource://gre/modules/Downloads.jsm", {});

							// Date in the following format: YYYYMMDDHHMMSS
							var d = new Date().toISOString().replace(/-/g, "").replace(/T/g, "").replace(/:/g, "").slice(0, 14);
							var fileName = OS.Path.join(OS.Constants.Path.tmpDir, "sfoa-" + d + ".ics");

							var downloadPromise = Downloads.createDownload({source: url, target: fileName});
							downloadPromise.then(function success(d) {
								d.start();
								alert("Saved ICS: " + fileName)
							});
						}
					}

					elem.onclick = download;
					if(button !== null) {
						button.onclick = download;
					}
				} else {
					console.log("SFOA: Alternative part but no calendar entry found");
				}

				return false;
			});
		});
	},

	collectSameTypeBodies : function(aMessage) {
		var bodiesWithTypes = {};

		var header = aMessage.split('\r\n\r\n')[0];
		var boundaryMatch = header.match(this.MULTIPART_ALTERNATIVE_MATCHER);
		if (!boundaryMatch)
			return bodiesWithTypes;

		var boundary = '--' + boundaryMatch[4];
		var lastPart = [];
		var checkPart = (function(aPart) {
			var header = aPart.split('\r\n\r\n')[0];
			if (/^Content-Type:[^\r]+(\r\n [^\r]+)*name=.+/im.test(header) || /^Content-Disposition:\s*attachment[^\r]+(\r\n [^\r]+)*filename.+/im.test(header))
				return; // ignore regular attachments

			var typeMatch = header.match(/^Content-Type:\s*([^\s]+)\s*/im);
			if (typeMatch) {
				let type = typeMatch[1];
				bodiesWithTypes[type] = bodiesWithTypes[type] || [];
				bodiesWithTypes[type].push(aPart);
			}
		}).bind(this);
		
		var inPreAlternativeParts = true;
		aMessage.split('\r\n').forEach((aLine) => {
			if (aLine != boundary) {
				lastPart.push(aLine)
				return;
			}
			if (inPreAlternativeParts) {
				inPreAlternativeParts = false;
			} else {
				checkPart(lastPart.join('\r\n'));
			}
			lastPart = [];
		});
		
		checkPart(lastPart.join('\r\n'));
		return bodiesWithTypes;
	},

	onStartHeaders: function() {},
	onEndHeaders: function() {
		this.newMessageSelected();
	},
	onEndAttachments: function () {}
};


function StreamMessageLoader(aURI, aContext) {
	this.URI = aURI;
	this.context = aContext || {};
}
StreamMessageLoader.prototype = {
	// get creates a getter which is called when this.messengerService is being accessed
	// Singleton pattern used here
	get messengerService() {
		if(this._messengerService) {
			return this._messengerService;
		}
		return this._messengerService = messenger.messageServiceFromURI(this.URI).QueryInterface(Ci.nsIMsgMessageService);
	},

	prepare: function() {
		this.context.hdr = this.messengerService.messageURIToMsgHdr(this.URI);
		this.context.folder = this.context.hdr.folder;
		return Promise.resolve(this.context);
	},

	loadHeaders: function() {
		return this.prepare().then((aContext) => {
			return new Promise((aResolve, aReject) => {
				this._resolverHeaders = aResolve;
				this._rejectorHeaders = aReject;
				this.messengerService.streamHeaders(this.URI, this, null, null, false, null);
			});
		});
	},

	loadAll: function() {
		return this.prepare().then((aContext) => {
			return new Promise((aResolve, aReject) => {
				this._resolverAll = aResolve;
				this._rejectorAll = aReject;
				this.messengerService.streamMessage(this.URI, this, null, null, false, null);
			});
		});
	},

	// streamMessage listener
	QueryInterface: function(iid) {
		if(iid.equals(Components.interfaces.nsIStreamListener) || iid.equals(Components.interfaces.nsISupports)) {
			return this;
		}

		throw Components.results.NS_NOINTERFACE;
	},

	onStartRequest : function (aRequest, aContext) {
		if (this._resolverHeaders)
			this.context.headers = '';
		if (this._resolverAll)
			this.context.message = '';
	},

	onStopRequest : function (aRequest, aContext, aStatusCode) {
		if (this._resolverHeaders) {
			this._resolverHeaders(this.context);
			delete this._resolverHeaders;
			delete this._rejectorHeaders;
		}
		if (this._resolverAll) {
			this._resolverAll(this.context);
			delete this._resolverAll;
			delete this._rejectorAll;
		}
	},

	onDataAvailable : function (aRequest, aContext, aInputStream, aOffset, aCount) {
		var scriptStream = Components.classes['@mozilla.org/scriptableinputstream;1'].createInstance().QueryInterface(Components.interfaces.nsIScriptableInputStream);
		scriptStream.init(aInputStream);
		var data = scriptStream.read(scriptStream.available());
		if (this._resolverHeaders)
			this.context.headers += data;
		if (this._resolverAll)
			this.context.message += data;
	}
};

// Add message listener on load of Thunderbird
window.addEventListener("DOMContentLoaded", function onDOMContentLoaded(e) {
	// Register message listener
	gMessageListeners.push(sfoaListener);
	// Remove itself to register message listener only once
	window.removeEventListener(e.type, onDOMContentLoaded, false);
}, false);
