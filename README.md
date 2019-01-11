SFOA – Show F*cking Outlook Appointments for Thunderbird
========================================================

For a long time I did not even know that Outlook silently sends calendar appointments via email and how all this works. In the last year more and more colleagues and customers of my company started using Outlook for appointments and I wondered always about empty emails or emails which do not make sense at all.

At some point I discovered that there are calendar appointments attached to the emails which are just not displayed by my Thunderbird.

When searching the Internet for a solution and following the bug report on mozilla (https://bugzilla.mozilla.org/show_bug.cgi?id=505024) there currently seems to be only one solution for this problem: Installing the Lightning extension.

As I am not using Lighting and am not willing to install a huge extension only to read these Outlook appointments I decided to create a lightweight extension with exactly one purpose. I hope I can help others with this extension and perhaps end a 10 year long debate on the bugtracker if Outlook is doing it wrong or whatever. At some point I just needed a solution which works.

### Disclaimer

I hacked together this Thunderbird extension without knowing much about Thunderbird extensions at all. So I copied code from various other exentions and made it work somehow. I could not find any up-to-date tutorials or documentation of the extension api so I only can hope that my code does what it should.

Don't blame me if something goes horribly wrong when using this exension. I did not dive deep into Thunderbird extensions, I did not read RFCs and I don't know if there are any side effects.

Help me by testing, reviewing and supporting this extension. Fork and create merge requests, I am happy to learn and willing to fix my mistakes.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

### How does it work

When opening a message the content is scanned for alternative parts. This btw is the reason Thunderbird does not display the calendar entry. Normally an appointment consists of three parts: text, html and calendar which are all marked as alternatives. Therefore according to RFCs only one has to be shown and Thunderbird prefers text or html.

When found, a button "Download ICS" is shown (has to be added by customizing the bar first) and a large image is shown in the header bar of the message.

![Screenshot](/images/bar.png?raw=true "Message bar with button and image")

Either click the button or the image to save the ICS file in your temp directory.

![Screenshot](/images/alert.png?raw=true "Confirmation message")

### Tested Platforms

This addon has been currently tested only on Linux using Thunderbird 60.3.0 64bit. Let me know if it works on your system.

### Installing

Just install the latest XPI from the dist folder by using "Install Add-On From File" in Thunderbird in the addons tab.

After installing only the banner hint for an ICS attachment will be shown. To add the corresponding button to the tab bar, you have to customize the buttons by right clicking. Then drag and drop the blue button at the place you like.

This Addon is also available on https://addons.thunderbird.net/de/thunderbird/addon/sfoa/

### Thanks

Thanks to all the available extensions out there where I could take a look how things work. But a special thanks goes to the "Rescue Conflicting Alternatives" (https://github.com/clear-code/tb-rescue-conflicting-alternatives) extension which was the base for this one.

### ToDo

There is so much to do. First this extension needs more testing. I only tested with one mail invitation so far.

* Review code
* Upload to Mozilla Extension DB
* Localize
* Show folder selector when saving ICS
* ...

### Support Me

If you like this extension and want to support me, I am happy to receive donations via PayPal: donate@omoco.de / https://www.paypal.me/omoco

### License

Copyright (c) 2019 Sebastian Hammerl

This Software is licensed under the GPL V3
