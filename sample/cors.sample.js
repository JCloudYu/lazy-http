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
	 *		origin: @string|null,
	 *		method: @string|null
	 *  }
	 *
	 *  The function must return an object containing following cors policy structure
	 *  {
	 *  	allow_origin: @string|null|'*',
	 * 		allow_methods: [ @string ],
	 * 		allow_credentials: @bool,
	 * 		allow_headers: [ @string ],
	 * 		expose_headers: [ @string ],
	 * 		max_age: @int
	 *  }
	**/
	module.exports = function(req_info={resource:{}, origin:'', method:''}){
		return {
			allow_origin: '*',
			allow_methods: [ 'OPTIONS', 'POST', 'GET', 'DELETE', 'PUT', 'PATCH' ]
		};
	};
	
	return;
	
	
	
	/**
	 *	Or return an object that matching pattern and corresponding handler or cors policy
	 *  {
	 *  	allow_origin: @string|null|'*',
	 * 		allow_methods: [ @string ],
	 * 		allow_credentials: @bool,
	 * 		allow_headers: [ @string ],
	 * 		expose_headers: [ @string ],
	 * 		max_age: @int
	 *  }
	**/
	module.exports = {
		// Prefix search with static policy
		"/": {
			allow_origin: '*',
			allow_methods: [ 'OPTIONS', 'POST', 'GET' ]
		},
		
		// Prefix search with dynamic policy
		"/usr": (cors_info)=>{
			return {
				allow_origin: `${cors_info.origin}`,
				allow_methods: [ 'OPTIONS', 'DELETE', 'GET' ]
			}
		},
		
		// Regular expression pattern patch with static policy
		"*~ .*\/test.end$": {
			allow_origin: 'origin',
			allow_methods: [ 'OPTIONS', 'POST' ]
		},
		
		// Regular expression pattern patch with dynamic policy
		"*~ .*\/test.begin$": (cors_info)=>{
			return {
				allow_origin: 'origin',
				allow_methods: [ 'OPTIONS', 'POST' ]
			};
		}
	};
	
})();


