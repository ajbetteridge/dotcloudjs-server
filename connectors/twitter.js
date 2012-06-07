var http = require('http'),
    querystring = require('querystring'),
    oauth = require('oauth'),
    streamparser = require('../utils/parser');

var Twitter = function(options) {
    var defaults = {
        rest_base: 'https://api.twitter.com/1',
        search_base: 'https://search.twitter.com',
        stream_base: 'https://stream.twitter.com/1',
        user_stream_base: 'https://userstream.twitter.com/2',
        site_stream_base: 'https://sitestream.twitter.com/2b',

        request_token_url: 'https://api.twitter.com/oauth/request_token',
        access_token_url: 'https://api.twitter.com/oauth/access_token',
        callback_url: null,

        headers: {
            'Accept': '*/*',
            'Connection': 'close',
            'User-Agent': 'dotcloud.js-twitter/0.1'
        }
    };

    for (var i in defaults) {
        options[i] = options[i] || defaults[i];
    }

    this.options = options;

    this.oauth = new oauth.OAuth(
        this.options.request_token_url,
        this.options.access_token_url,
        this.options.consumer_key,
        this.options.consumer_secret,
        '1.0A',
        this.options.callback_url,
        'HMAC-SHA1', null,
        this.options.headers);
    this.auth = options.access_token_key && options.access_token_secret ? {
        key: this.options.access_token_key,
        secret: this.options.access_token_secret
    } : null;
};

/*
 * GET
 */
Twitter.prototype.get = function(url, params, auth, callback) {
    if (typeof params === 'function') {
        callback = params;
        auth = null;
        params = null;
    } else if (typeof auth === 'function') {
        callback = auth, auth = null;
    }

    auth = auth || this.auth || {};

    if ( typeof callback !== 'function' ) {
        throw "FAIL: INVALID CALLBACK.";
        return this;
    }

    if (url.charAt(0) == '/')
        url = this.options.rest_base + url;

    this.oauth.get(url + '?' + querystring.stringify(params),
        auth.key,
        auth.secret,
    function(error, data, response) {
        if (error) {
            var err = new Error('HTTP Error '
                + error.statusCode + ': '
                + http.STATUS_CODES[error.statusCode]);
            err.statusCode = error.statusCode;
            err.data = error.data;
            callback(err);
        } else {
            try {
                var json = JSON.parse(data);
                callback(json);
            } catch(err) {
                callback(err);
            }
        }
    });
    return this;
}


/*
 * POST
 */
Twitter.prototype.post = function(url, content, auth, callback) {
    if (typeof content === 'function') {
        callback = content;
        content = null;
        auth = null;
    } else if (typeof auth === 'function') {
        callback = auth;
        auth = null;
    }

    auth = auth || this.auth || {};

    if ( typeof callback !== 'function' ) {
        throw "FAIL: INVALID CALLBACK.";
        return this;
    }

    if (url.charAt(0) == '/')
        url = this.options.rest_base + url;

    // Workaround: oauth + booleans == broken signatures
    if (content && typeof content === 'object') {
        Object.keys(content).forEach(function(e) {
            if ( typeof content[e] === 'boolean' )
                content[e] = content[e].toString();
        });
    }

    this.oauth.post(url,
        auth.key,
        auth.secret,
        content, null,
    function(error, data, response) {
        if (error) {
            var err = new Error('HTTP Error '
                + error.statusCode + ': '
                + http.STATUS_CODES[error.statusCode]);
            err.statusCode = error.statusCode;
            err.data = error.data;
            callback(err);
        } else {
            try {
                var json = JSON.parse(data);
                callback(json);
            } catch(err) {
                callback(err);
            }
        }
    });
    return this;
}

Twitter.prototype.search = function(q, params, callback) {
    if (typeof params === 'function') {
        callback = params;
        params = null;
    }

    if ( typeof callback !== 'function' ) {
        throw "FAIL: INVALID CALLBACK.";
        return this;
    }

    var url = this.options.search_base + '/search.json';
    params.q = params.q || q;
    this.get(url, params, callback);
    return this;
};

Twitter.prototype.stream = function(method, params, auth, callback) {
    if (typeof params === 'function') {
        callback = params, auth = null, params = null;

    } else if (typeof auth === 'function') {
        callback = auth, auth = null;
    }

    auth = auth || this.auth || {};

    var stream_base = this.options.stream_base;

    // Stream type customisations
    if (method === 'user') {
        stream_base = this.options.user_stream_base;
        // Workaround for node-oauth vs. twitter commas-in-params bug
        if ( params && params.track && Array.isArray(params.track) ) {
            params.track = params.track.join(',')
        }

    } else if (method === 'site') {
        stream_base = this.options.site_stream_base;
        // Workaround for node-oauth vs. twitter double-encode-commas bug
        if ( params && params.follow && Array.isArray(params.follow) ) {
            params.follow = params.follow.join(',')
        }
    }


    var url = stream_base + '/' + escape(method) + '.json';

    var request = this.oauth.post(url, auth.key, auth.secret, params);

    var stream = new streamparser();
    stream.destroy = function() {
        // FIXME: should we emit end/close on explicit destroy?
        if ( typeof request.abort === 'function' )
            request.abort(); // node v0.4.0
        else
            request.socket.destroy();
    };

    request.on('response', function(response) {
        // FIXME: Somehow provide chunks of the response when the stream is connected
        // Pass HTTP response data to the parser, which raises events on the stream
        response.on('data', function(chunk) {
            stream.receive(chunk);
        });
        response.on('error', function(error) {
            stream.emit('error', error);
        });
        response.on('end', function() {
            stream.emit('end', response);
        });
    });
    request.on('error', function(error) {
        stream.emit('error', error);
    });
    request.end();

    if ( typeof callback === 'function' ) callback(stream);
    return this;
}

module.exports = function(options) {
    return new Twitter(options);
}