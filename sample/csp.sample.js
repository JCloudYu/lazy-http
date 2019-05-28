(()=>{
	"use strict";
	
	/**
	 *	You can return a function that will accept an argument that contains following structure
	 *	{
	 *		resource: {
	 *			path: @string,
	 *			hash: @string,
	 *			search: @string
	 *		},
	 *		referer: @string|null,
	 *		origin: @string|null,
	 *		method: @string|null
	 *  }
	 *
	 *  The function must return an object containing fetch-directives listed in
	 *  https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy#Fetch_directives
	**/
	module.exports = function(req_info={resource:{}, referer:'', origin:'', method:''}){
		return {
			"default-src": [ 'self', 'data:', 'gap:', 'blob:' ],
			"script-src": [ 'self', 'blob:', 'unsafe-inline', 'unsafe-eval', 'res.purimize.com', 'cdn.jsdelivr.net' ],
			"style-src": [ 'self', 'unsafe-inline', 'res.purimize.com', 'fonts.googleapis.com' ],
			"font-src": [ 'self', 'res.purimize.com', 'fonts.googleapis.com', 'fonts.gstatic.com' ]
		};
	};
	
//	return;
	
	
	
	/**
	 *	Or return an object that matching pattern and corresponding csp fetch directives or cors policy
	 *	https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy#Fetch_directives
	**/
	module.exports = {
		// Prefix search with static policy
		"/": {
			"default-src": [ "self", "data:", "gap:", "blob:", "unsafe-inline" ]
		},
		
		// Prefix search with dynamic policy
		"/usr": (cors_info)=>{
			return {
				"default-src": [ 'self', 'data:', 'gap:', 'blob:' ],
				"script-src": [ 'self', 'blob:', 'unsafe-inline', 'unsafe-eval', 'res.purimize.com', 'cdn.jsdelivr.net' ],
				"style-src": [ 'self', 'unsafe-inline', 'res.purimize.com', 'fonts.googleapis.com' ],
				"font-src": [ 'self', 'res.purimize.com', 'fonts.googleapis.com', 'fonts.gstatic.com' ]
			};
		},
		
		// Exact match with static policy
		"= /index.hml": {
			"default-src": [ 'self', 'data:', 'gap:', 'blob:' ],
			"script-src": [ 'self', 'blob:', 'unsafe-inline', 'unsafe-eval', 'res.purimize.com', 'cdn.jsdelivr.net', 'momentjs.com' ],
			"style-src": [ 'self', 'unsafe-inline', 'res.purimize.com', 'fonts.googleapis.com' ],
			"font-src": [ 'self', 'res.purimize.com', 'fonts.googleapis.com', 'fonts.gstatic.com' ]
		},
		
		// Exact match with dynamic policy
		"= /other.hml": ()=>{
			return {
				"default-src": [ 'self', 'data:', 'gap:', 'blob:' ],
				"script-src": [ 'self', 'blob:', 'unsafe-inline', 'unsafe-eval', 'res.purimize.com', 'cdn.jsdelivr.net', 'momentjs.com' ],
				"style-src": [ 'self', 'unsafe-inline', 'res.purimize.com', 'fonts.googleapis.com' ],
				"font-src": [ 'self', 'res.purimize.com', 'fonts.googleapis.com', 'fonts.gstatic.com' ]
			};
		},
		
		// Regular expression pattern patch with static policy
		"*~ .*\/test.end$": {
			"default-src": [ 'self', 'data:', 'gap:', 'blob:' ],
			"script-src": [ 'self', 'blob:', 'unsafe-inline', 'unsafe-eval', 'res.purimize.com', 'cdn.jsdelivr.net' ],
			"style-src": [ 'self', 'unsafe-inline', 'res.purimize.com', 'fonts.googleapis.com' ],
			"font-src": [ 'self', 'res.purimize.com', 'fonts.googleapis.com', 'fonts.gstatic.com' ]
		},
		
		// Regular expression pattern patch with dynamic policy
		"*~ .*\/test.begin$": (cors_info)=>{
			return {
				"default-src": [ 'self', 'data:', 'gap:', 'blob:' ],
				"script-src": [ 'self', 'blob:', 'unsafe-inline', 'unsafe-eval', 'res.purimize.com', 'cdn.jsdelivr.net' ],
				"style-src": [ 'self', 'unsafe-inline', 'res.purimize.com', 'fonts.googleapis.com' ],
				"font-src": [ 'self', 'res.purimize.com', 'fonts.googleapis.com', 'fonts.gstatic.com' ]
			};
		}
	};
	
})();


