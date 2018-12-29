const { Promise } = Components.utils.import('resource://gre/modules/Promise.jsm', {});

var sfoaListener = {
	tryUpdateCurrentMessage : function() {
		var context = {};
		return this.shouldApply(context).then((aShouldApply) => {
			return;
		}).catch((aError) => console.log(aError));
	},

	get selectedMessageURI() {
		return gFolderDisplay.selectedMessageUris[0];
	},

	ensureCurrentMessagePrepared : function(aContext) {
		if (aContext && aContext.headers)
			return Promise.resolve(aContext);

		aContext = aContext || {};
		let loader = new StreamMessageLoader(this.selectedMessageURI, aContext);
		return loader.loadHeaders();
	},

	ensureCurrentMessageLoaded : function(aContext) {
		if (aContext && aContext.message)
			return Promise.resolve(aContext);

		aContext = aContext || {};
		let loader = new StreamMessageLoader(this.selectedMessageURI, aContext);
		return loader.loadAll().then((aContext) => {
			return aContext;
		});
	},

	shouldApply : function(aContext) {
		return this.ensureCurrentMessagePrepared(aContext).then((aContext) => {
			var button = document.getElementById("fucking-outlook-appointment-button");
			button.style.display = "none";
			var elem = document.getElementById("fucking-outlook-appointment-outer");
			elem.style.display = "none";
			
			if (!this.MULTIPART_ALTERNATIVE_MATCHER.test(aContext.headers)) {
				console.log("SFOA: No alternative part found");
				return false;
			}

			return this.ensureCurrentMessageLoaded(aContext).then((aContext) => {
				var bodies = this.collectSameTypeBodies(aContext.message);
				
				if(bodies["text/calendar;"] !== undefined) {
					console.log("SFOA: Alternative part and calendar entry found");
					var calendarEntry = bodies["text/calendar;"][0];
					calendarEntry = calendarEntry.replace(/\r/g, "");
					calendarEntry = calendarEntry.split("\n");
					calendarEntry.shift();
					calendarEntry.shift();
					calendarEntry.shift();
					calendarEntry.pop();
					calendarEntry.pop();
					calendarEntry.pop();
					calendarEntry = calendarEntry.join("");
					calendarEntry = atob(calendarEntry);
					
					elem.style.display = "block";
					button.style.display = "block";
					
					var download = function() {
						var url = "data:text/calendar;charset=utf8," + escape(calendarEntry);
						const {Downloads} = Cu.import("resource://gre/modules/Downloads.jsm", {});
						var file = OS.Path.join(OS.Constants.Path.tmpDir, "sfoa-" + (new Date().getYear()+1900) + (new Date().getMonth()+1) + new Date().getDate() + new Date().getHours() + new Date().getMinutes() + new Date().getSeconds() + ".ics");
						var downloadPromise = Downloads.createDownload({source: url, target: file});
						downloadPromise.then(function success(d) {
							d.start();
							alert("Saved ICS: " + file)
						});
					}
					
					elem.onclick = download;
					button.onclick = download;
				} else {
					console.log("SFOA: Alternative part but no calendar entry found");
				}
			
				return false;
			});
		});
	},

	MULTIPART_ALTERNATIVE_MATCHER : /^(Content-Type:\s*)multipart\/alternative(;\s*boundary=(['"]?)([^\s]+)\3)/im,

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
		this.tryUpdateCurrentMessage();
	},
	onEndAttachments: function () {}
};


function StreamMessageLoader(aURI, aContext) {
	this.URI = aURI;
	this.context = aContext || {};
}
StreamMessageLoader.prototype = {
	get messengerService() {
		if (this._messengerService)
			return this._messengerService;
		return this._messengerService = messenger.messageServiceFromURI(this.URI).QueryInterface(Ci.nsIMsgMessageService);
	},

	prepare : function() {
		this.context.hdr = this.messengerService.messageURIToMsgHdr(this.URI);
		this.context.folder = this.context.hdr.folder;
		return Promise.resolve(this.context);
	},

	loadHeaders : function() {
		return this.prepare().then((aContext) => {
			return new Promise((aResolve, aReject) => {
				this._resolverHeaders = aResolve;
				this._rejectorHeaders = aReject;
				this.messengerService.streamHeaders(this.URI, this, null, null, false, null);
			});
		});
	},

	loadAll : function() {
		return this.prepare().then((aContext) => {
			return new Promise((aResolve, aReject) => {
			this._resolverAll = aResolve;
			this._rejectorAll = aReject;
			this.messengerService.streamMessage(this.URI, this, null, null, false, null);
			});
		});
	},

	// streamMessage listener
	QueryInterface : function(iid)  {
		if (iid.equals(Components.interfaces.nsIStreamListener) || iid.equals(Components.interfaces.nsISupports))
			return this;

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


window.addEventListener('DOMContentLoaded', function onDOMContentLoaded(aEvent) {
	gMessageListeners.push(sfoaListener);
	window.removeEventListener(aEvent.type, onDOMContentLoaded, false);
}, false);
