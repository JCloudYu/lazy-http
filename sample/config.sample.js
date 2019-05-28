module.exports = {
	"host": "127.0.0.1",
	"port": 8080,
	"document_root": null,
	"ssl_check": true,
	"rules": [
		"proxy:local:pipe:/path/to/unix/socket",
		"proxy:localhost:http:127.0.0.1:5080",
		"proxy:127.0.0.1:https:www.google.com:443",
		
		"cors:localhost:cors.sample.js",
		"csp:localhost:csp.sample.json",
		
		"mime:bjs:application/javascript"
	]
};
