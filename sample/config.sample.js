module.exports = {
	host: "127.0.0.1",
	port: 8080,
	document_root: null,
	ssl_check: true,
	proxy_only: false,
	rules: [
		"proxy:local:pipe:/path/to/unix/socket",
		"proxy:localhost:http:127.0.0.1:5080",
		"proxy:localhost/:http:127.0.0.1:5081",
		"proxy:localhost/res/:http:127.0.0.1:5082",
		"proxy:127.0.0.1:https:www.google.com:443",
		
		"cors:localhost:cors.sample.json",
		"csp:localhost:csp.sample.js",
		
		"mime:bjs:application/javascript"
	]
};
