/**
 *	Author: JCloudYu
 *	Create: 2019/05/20
**/
const EXPORTED = Object.create(null);

EXPORTED.ParseURLPath = function PARSE_URL_PATH(raw_url) {
	let temp, url_info = Object.assign(Object.create(null), {
		raw:raw_url, path:null, search:null, hash:null
	});
	
	
	// NOTE: Eat hash
	temp = raw_url.indexOf('#');
	if ( temp < 0 ) {
		url_info.hash = '';
	}
	else {
		url_info.hash = raw_url.substring(temp);
		raw_url = raw_url.substring(0, temp);
	}
	
	// NOTE: Eat query
	temp = raw_url.indexOf('?');
	if ( temp < 0 ) {
		url_info.search = '';
	}
	else {
		url_info.search = raw_url.substring(temp);
		raw_url = raw_url.substring(0, temp);
	}
	
	
	
	url_info.path = raw_url;
	return Object.freeze(url_info);
};
EXPORTED.GenerateCORSProcessor = function(cors_conf) {
	const match_info = Object.create(null);
	match_info.prefix = [];
	match_info.regex  = [];
	
	for( let match_rule in cors_conf ) {
		if ( !cors_conf.hasOwnProperty(match_rule) ) continue;
		
		
		const rule = Object.create(null);
		const handler = cors_conf[match_rule];
		
		try {
			// region [ Generate match handler ]
			if ( typeof handler == "function" ) {
				rule.handler = handler;
			}
			else if ( Object(handler) === handler ) {
				rule.handler = ()=>{ return handler; };
			}
			else { throw new Error(""); }
			// endregion
		
			// region [ Generate path matcher ]
			if ( match_rule.substring(0, 3) === "*~ " ) {
				match_rule = match_rule.substring(3);
				rule.match = new RegExp(match_rule);
				match_info.regex.push(rule);
			}
			else {
				rule.match = match_rule;
				match_info.prefix.push(rule);
			}
			// endregion
		}
		catch(e) {
			// NOTE: This line should never be reached!
			// NOTE: Reaching here means there're some errors in the CORS conf
			return null;
		}
	}
	
	return CORSProcessor.bind(match_info);
};

module.exports = Object.freeze(EXPORTED);


/**
 *	@typedef {Object} ResourceInfo
 *	@property {String|null} [path]
 *	@property {String|null} [hash]
 *	@property {String|null} [search]
**/

/**
 *	@typedef {Object} CORSReqInfo
 *	@property {ResourceInfo} [resource]
 *	@property {String|null} [origin]
 *	@property {String|null} [method]
**/

/** @param {CORSReqInfo} cors_info **/
async function CORSProcessor(cors_info) {
	const {resource:{path}} = cors_info;
	
	let _matched_path = null, _handler = null;
	for( let {match, handler} of this.prefix ) {
		if ( match.length < path ) continue;
		if ( path.substring(0, match.length) === match ) {
			if ( _matched_path && match.length < _matched_path.length ) continue;
			_handler = handler;
			_matched_path  = match;
		}
	}
	
	if ( _handler && _matched_path !== "/" ) {
		return await _handler(cors_info);
	}
	
	
	
	for( let {match, handler} of this.regex ) {
		const matches = path.match(match);
		if ( !matches || matches[0].length < _matched_path.length ) continue;
		
		_handler = handler;
		_matched_path  = match[0];
	}
	
	return _handler ? await _handler(cors_info) : {};
}
