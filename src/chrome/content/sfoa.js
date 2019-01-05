/// Note: Lines containing 3 slashes will be removed during the build/dist process

const { Promise } = Components.utils.import('resource://gre/modules/Promise.jsm', {});

var sfoaListener = {
	newMessageSelected: function() {
		console.log("SFOA: newMessageSelected"); /// Debug
		var context = {};
		return this.scanMessageForAppointment(context).then(() => {
			return;
		}).catch((e) => console.log(e));
	},

	get selectedMessageURI() {
		console.log("SFOA: selectedMessageURI"); /// Debug
		return gFolderDisplay.selectedMessageUris[0];
	},

	// Load message headers
	ensureCurrentMessagePrepared: function(aContext) {
		console.log("SFOA: ensureCurrentMessagePrepared"); /// Debug
		if(aContext && aContext.headers) {
			return Promise.resolve(aContext);
		}

		aContext = aContext || {};
		let loader = new StreamMessageLoader(this.selectedMessageURI, aContext);
		return loader.loadHeaders();
	},

	// Load complete message
	ensureCurrentMessageLoaded: function(aContext) {
		console.log("SFOA: ensureCurrentMessageLoaded"); /// Debug
		if(aContext && aContext.message) {
			return Promise.resolve(aContext);
		}

		aContext = aContext || {};
		let loader = new StreamMessageLoader(this.selectedMessageURI, aContext);
		return loader.loadAll().then((aContext) => {
			return aContext;
		});
	},

	MULTIPART_ALTERNATIVE_MATCHER: /^(Content-Type:\s*)multipart\/alternative(;\s*boundary=(['"]?)([^\s]+)\3)/im,
	MULTIPART_MIXED_MATCHER: /^(Content-Type:\s*)multipart\/mixed(;\s*boundary=(['"]?)([^\s]+)\3)/im,

	scanMessageForAppointment: function(aContext) {
		console.log("SFOA: scanMessageForAppointment"); /// Debug
		return this.ensureCurrentMessagePrepared(aContext).then((aContext) => {
			// Get appointment indicator
			var elem = document.getElementById("outlook-appointment-outer");
			elem.style.display = "none";
			// Get button in bar and hide if available
			var button = document.getElementById("outlook-appointment-button");
			if(button !== null) {
				button.style.display = "none";
			}

			aContext.mixedFound = this.MULTIPART_MIXED_MATCHER.test(aContext.headers);
			aContext.alternativeFound = this.MULTIPART_ALTERNATIVE_MATCHER.test(aContext.headers);

			if(!aContext.alternativeFound && !aContext.mixedFound) {
				console.log("SFOA: No alternative or mixed parts found");
				return false;
			}

			return this.ensureCurrentMessageLoaded(aContext).then((aContext) => {
				var bodies = this.collectSameTypeBodies(aContext.message);
				console.log("SFOA: Alternative or mixed parts found: "); /// Debug
				console.log(bodies); /// Debug

				var type = "alternative";
				if(bodies["multipart/alternative;"] !== undefined) {
					console.log("SFOA: Mixed parts found: "); /// Debug
					type = "mixed";
					var bodies = this.collectSameTypeBodies(bodies["multipart/alternative;"][0]);
				}

				if(bodies["text/calendar;"] !== undefined) {
					console.log("SFOA: Alternative parts and calendar entry found");

					// Get calendar entry and reformat to ICS text
					var calendarEntry = bodies["text/calendar;"][0];

					// Remove \r line breaks
					calendarEntry = calendarEntry.replace(/\r/g, "");
					// Split by line
					calendarEntry = calendarEntry.split("\n");
					// Get body from part
					var newCalendarEntry = [];
					var record = false;
					for(var i=0; i<calendarEntry.length; i++) {
						if(record === true) {
							newCalendarEntry.push(calendarEntry[i]);
						}
						if(record === true && calendarEntry[i] === "") {
							break;
						}
						if(record === false && calendarEntry[i] === "") {
							record = true;
						}
					}

					if(type === "alternative") {
						// Join lines and convert BASE64 to text
						calendarEntry = newCalendarEntry.join("");
						calendarEntry = atob(calendarEntry);
					}

					if(type === "mixed") {
						// Join lines, message is email text
						calendarEntry = newCalendarEntry.join("\n");
						// From https://codepen.io/netsi1964/pen/ZYNPNz
						calendarEntry = calendarEntry.replace(/=(..)/g, function(v) { return String.fromCharCode(parseInt(v.replace("=",""), 16)) });
						calendarEntry = calendarEntry.replace(/=\n/g, "")
					}

					// Download ics file to tmp dir
					var download = function(e) {
						console.log("SFOA: scanMessageForAppointment->download"); /// Debug
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

					// Show indicator and button if available
					elem.style.display = "block";
					elem.onclick = download;
					if(button !== null) {
						button.style.display = "block";
						button.onclick = download;
					}
				} else {
					console.log("SFOA: Alternative parts but no calendar entry found");
				}

				return false;
			});
		});
	},

	collectSameTypeBodies: function(message) {
		console.log("SFOA: collectSameTypeBodies"); /// Debug
		var bodiesWithTypes = {};

		// An empty line separates header from message
		var header = message.split('\r\n\r\n')[0];
		// Check if content type is multipart/alternative, store boundary
		var boundaryMatch = header.match(this.MULTIPART_ALTERNATIVE_MATCHER);
		// If not found (should be found, as we checked headers) return empty object
		if(!boundaryMatch) {
			// IF not alternative check if type is mixed, store boundary
			boundaryMatch = header.match(this.MULTIPART_MIXED_MATCHER);
			if(!boundaryMatch) {
				return bodiesWithTypes;
			}
		}

		var checkPart = (function(part) {
			console.log("SFOA: collectSameTypeBodies -> checkPart"); /// Debug
			// Check header of current part
			var header = part.split('\r\n\r\n')[0];
			if(/^Content-Type:[^\r]+(\r\n [^\r]+)*name=.+/im.test(header) || /^Content-Disposition:\s*attachment[^\r]+(\r\n [^\r]+)*filename.+/im.test(header))
				return; // ignore regular attachments

			// Get type of part and store value in parts object
			var typeMatch = header.match(/^Content-Type:\s*([^\s]+)\s*/im);
			if(typeMatch) {
				let type = typeMatch[1];
				bodiesWithTypes[type] = bodiesWithTypes[type] || [];
				bodiesWithTypes[type].push(part);
			}
		}).bind(this);

		var boundary = '--' + boundaryMatch[4];
		var currentPart = [];
		var inPreAlternativeParts = true;
		// Scan through message, look by line for boundary
		message.split('\r\n').forEach((aLine) => {
			// If not boundary line, add to current part
			if(aLine != boundary) {
				currentPart.push(aLine)
				return;
			}
			if(inPreAlternativeParts) {
				// The first boundary match is in header, so ignore it
				inPreAlternativeParts = false;
			} else {
				// Part is complete, so check it
				checkPart(currentPart.join('\r\n'));
			}
			// Empty current part
			currentPart = [];
		});
		
		// After last boundary one part is left (does not match exactly due to "--" at end). Check it, too
		checkPart(currentPart.join('\r\n'));
		
		// Return parts object
		return bodiesWithTypes;
	},

	onStartHeaders: function() {
		console.log("SFOA: onStartHeaders"); /// Debug
	},
	onEndHeaders: function() {
		console.log("SFOA: onEndHeaders"); /// Debug
		this.newMessageSelected();
	},
	onEndAttachments: function() {
		console.log("SFOA: onEndAttachments"); /// Debug
	}
};


function StreamMessageLoader(aURI, aContext) {
	console.log("SFOA: StreamMessageLoader"); /// Debug
	this.URI = aURI;
	this.context = aContext || {};
}
StreamMessageLoader.prototype = {
	// "get" creates a getter which is called when this.messengerService is being accessed
	// Singleton pattern used here
	get messengerService() {
		if(this._messengerService) {
			return this._messengerService;
		}
		return this._messengerService = messenger.messageServiceFromURI(this.URI).QueryInterface(Ci.nsIMsgMessageService);
	},

	prepare: function() {
		console.log("SFOA: StreamMessageLoader->prepare"); /// Debug
		this.context.hdr = this.messengerService.messageURIToMsgHdr(this.URI);
		this.context.folder = this.context.hdr.folder;
		return Promise.resolve(this.context);
	},

	loadHeaders: function() {
		console.log("SFOA: StreamMessageLoader->loadHeaders"); /// Debug
		return this.prepare().then((aContext) => {
			return new Promise((aResolve, aReject) => {
				this._resolverHeaders = aResolve;
				this._rejectorHeaders = aReject;
				this.messengerService.streamHeaders(this.URI, this, null, null, false, null);
			});
		});
	},

	loadAll: function() {
		console.log("SFOA: StreamMessageLoader->loadAll"); /// Debug
		return this.prepare().then((aContext) => {
			return new Promise((aResolve, aReject) => {
				this._resolverAll = aResolve;
				this._rejectorAll = aReject;
				this.messengerService.streamMessage(this.URI, this, null, null, false, null);
			});
		});
	},

	// StreamMessage listener
	QueryInterface: function(iid) {
		if(iid.equals(Components.interfaces.nsIStreamListener) || iid.equals(Components.interfaces.nsISupports)) {
			return this;
		}
		throw Components.results.NS_NOINTERFACE;
	},

	onStartRequest: function(aRequest, aContext) {
		console.log("SFOA: StreamMessageLoader->onStartRequest"); /// Debug
		if(this._resolverHeaders)
			this.context.headers = '';
		if(this._resolverAll)
			this.context.message = '';
	},

	onStopRequest: function(aRequest, aContext, aStatusCode) {
		console.log("SFOA: StreamMessageLoader->onStopRequest"); /// Debug
		if(this._resolverHeaders) {
			this._resolverHeaders(this.context);
			delete this._resolverHeaders;
			delete this._rejectorHeaders;
		}
		if(this._resolverAll) {
			this._resolverAll(this.context);
			delete this._resolverAll;
			delete this._rejectorAll;
		}
	},

	onDataAvailable: function(aRequest, aContext, aInputStream, aOffset, aCount) {
		console.log("SFOA: StreamMessageLoader->onDataAvailable"); /// Debug
		var scriptStream = Components.classes['@mozilla.org/scriptableinputstream;1'].createInstance().QueryInterface(Components.interfaces.nsIScriptableInputStream);
		scriptStream.init(aInputStream);
		var data = scriptStream.read(scriptStream.available());
		if(this._resolverHeaders)
			this.context.headers += data;
		if(this._resolverAll)
			this.context.message += data;
	}
};

// Add message listener on load of Thunderbird
window.addEventListener("DOMContentLoaded", function onDOMContentLoaded(e) {
	console.log("SFOA: onDOMContentLoaded"); /// Debug
	// Register message listener
	gMessageListeners.push(sfoaListener);
	// Remove itself to register message listener only once
	window.removeEventListener(e.type, onDOMContentLoaded, false);
}, false);
