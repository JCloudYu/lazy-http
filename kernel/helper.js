/**
 *	Author: JCloudYu
 *	Create: 2019/05/20
**/
const EXPORTED = Object.create(null);
const RULE_CHECKER = /^((=|~\*) )?(.*)+$/;


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
EXPORTED.GenerateMatchProcessor = function(conf) {
	const match_info = Object.assign(Object.create(null),{
		exact: [], prefix: [], regex: []
	});
	
	for( let match_rule in conf ) {
		if ( !conf.hasOwnProperty(match_rule) ) continue;
		
		
		const rule = Object.create(null);
		const handler = conf[match_rule];
		
		try {
			if ( typeof handler == "function" ) {
				rule.handler = handler;
			}
			else if ( Object(handler) === handler ) {
				rule.handler = ()=>{ return handler; };
			}
			else {
				throw new Error("");
			}
		
		
			({match_rule:rule.match_rule, test:rule.test, type:rule.type} = BuildPathMatcher(match_rule));
			match_info[rule.type].push(rule);
		}
		catch(e) {
			// NOTE: This line should never be reached!
			// NOTE: Reaching here means there're some errors in the CORS conf
			return null;
		}
	}
	
	return MatchProcessor.bind(match_info);
};
EXPORTED.Drain = function Drain(stream) {
	const result = {
		hash: null,
		length: 0
	};
	const hash = require( 'crypto' ).createHash( 'sha1' );
	

	return new Promise((resolve, reject)=>{
		if ( stream.complete ) {
			result.hash = hash.digest('hex');
			
			resolve(result);
			return;
		}
		
		stream
		.on('end', resolve)
		.on('error', reject)
		.on('data', (chunk)=>{
			hash.update(chunk);
			result.length += chunk.length;
		});
	});
};
module.exports = Object.freeze(EXPORTED);


/**
 *	@typedef {Object} ResourceInfo
 *	@property {String|null} [path]
 *	@property {String|null} [hash]
 *	@property {String|null} [search]
**/

/**
 *	@typedef {Object} RequestInfo
 *	@property {ResourceInfo} [resource]
 *	@property {String|null} [referer]
 *	@property {String|null} [origin]
 *	@property {String|null} [method]
**/

/**
 *	@param {RequestInfo} req_info
 *	@return {Object}
**/
async function MatchProcessor(req_info) {
	const {resource:{path}} = req_info;
	
	let _handler, _matched_path = null;
	
	// NOTE: Locate the longest exact match
	for( let {test, handler} of this.exact ) {
		const match_result = test(path);
		if ( !match_result ) continue;
		if ( _matched_path && match_result.length < _matched_path.length ) continue;
		
		_handler = handler;
		_matched_path = match_result;
	}
	
	if ( _handler ) {
		return await _handler(req_info);
	}
	
	// NOTE: Locate the longest prefix match
	for( let {test, handler} of this.prefix ) {
		const match_result = test(path);
		if ( !match_result ) continue;
		if ( _matched_path && match_result.length < _matched_path.length ) continue;
		
		_handler = handler;
		_matched_path = match_result;
	}
	
	// NOTE: Prefix "/" is a special case
	if ( _handler && _matched_path !== "/" ) {
		return await _handler(req_info);
	}
	
	
	
	for( let {test, handler} of this.regex ) {
		const match_result = test(path);
		if ( !match_result ) continue;
		if ( _matched_path && match_result.length < _matched_path.length ) continue;
		
		_handler = handler;
		_matched_path = match_result;
	}
	
	return _handler ? await _handler(req_info) : {};
}

/**
 *	@param {String} match_rule
 *	@return {{test:Function, type:String}}
**/
function BuildPathMatcher(match_rule) {
	const [,, operator, rule] = match_rule.match(RULE_CHECKER);
	
	let _matcher = Object.create(null);
	switch(operator) {
		case "=":
			_matcher.test = (path)=>{
				if ( (path.length === rule.length) && (path === rule) ) {
					return path;
				}
				else {
					return null;
				}
			};
			_matcher.type = "exact";
			_matcher.match_rule = rule;
			break;
		
		case "~*": {
			const regex = new RegExp(rule);
			_matcher.test = (path)=>{
				const matches = path.match(regex);
				return matches ? matches[0] : null;
			};
			_matcher.type = "regex";
			_matcher.match_rule = rule;
			break;
		}
			
		default: {
			_matcher.test = (path)=>{
				if ( (path.length >= rule.length) && (path.substring(0, rule.length) === rule) ) {
					return rule;
				}
				else {
					return null;
				}
			};
			_matcher.type = "prefix";
			_matcher.match_rule = rule;
			break;
		}
	}
	
	return _matcher;
}
