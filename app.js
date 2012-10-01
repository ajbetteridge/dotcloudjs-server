var express = require('express');
var app = module.exports = express.createServer();

// Environment
var fs = require('fs');
try {
    var env = JSON.parse(fs.readFileSync('/home/dotcloud/environment.json'));
} catch (e) {
    env = process.env;
}

var CENTRALIZE = !(env.DECENTRALIZE === "true" || env.DECENTRALIZE === true),
    REGISTRAR_ENDPOINT = env.REGISTRAR_ENDPOINT || 'tcp://127.0.0.1:27615';


// Configuring stack.io

var stack = require('stack.io'),
    io = new stack.ioServer();

io.connector(new stack.SocketIOConnector(app));

// Service middlewares
//  - Twitter
io.middleware(/.+/, /twitter-.+/, /.+/, function(req, res, next) {
    req.args = [req.service, req.method, req.args];
    req.service = 'twitter';
    req.method = 'transfer';
    next();
});

//  - Private DB
io.middleware(/.+/, /db-private/, /.+/, function(req, res, next) {
    if (!req.session.auth) {
        res.update({
            name: 'AuthenticationError',
            message: 'You must be authenticated to perform this action.'
        }, undefined, false);
        return next();
    }

    req.args[0] = '_private.' + req.args[0] + '.' + req.session.username;
    req.service = 'db';

    next();
});

//  - Private sync
io.middleware(/.+/, /sync-private/, /.+/, function(req, res, next) {
    if (!req.session.auth) {
        res.update({
            name: 'AuthenticationError',
            message: 'You must be authenticated to perform this action.'
        }, undefined, false);
        return next();
    }

    req.args[0] = '_private.' + req.args[0] + '.' + req.session.username;
    req.service = 'sync';

    next();
});

// Stack.io middlewares

//  - Authentication
io.middleware(/.+/, /auth/, /.+/, function(req, res, next) {
    if (req.method == 'register') {
        req.method = 'addUser';
    } else if (req.method == 'logout' || req.method == 'login') {
        req.service = '_stackio';
    } else if (req.method != 'hasUser') {
        res.update({
            message: 'Can not access method: ' + req.method + ' in service' + req.service,
            name: 'AuthorizationError'
        }, undefined, false);
    }

    next();
});

io.middleware(/.+/, /_stackio/, /login/, require('./node_modules/stack.io/bin/stack.io/lib/middleware/auth/normal/login')({}));
io.middleware(/.+/, /_stackio/, /logout/, require('./node_modules/stack.io/bin/stack.io/lib/middleware/auth/logout'));

//  - stackio builtins, registrar
io.middleware(/.+/, /_stackio/, /.+/, stack.builtinsMiddleware);
io.middleware(/.+/, /.+/, /.+/, stack.zerorpcMiddleware(REGISTRAR_ENDPOINT));

// Express Configuration
app.configure(function(){
    app.use(express.bodyParser());
    app.use(express.methodOverride());
    app.use(express.cookieParser());
    app.use(express.session({ secret: "g45T6VcCqq09" }));
    app.use(app.router);
});

app.configure('development', function(){
    app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
});

app.configure('production', function(){
    app.use(express.errorHandler());
});


// Database configuration
var db, dbConfig = {
    host: env.DOTCLOUD_DB_MONGODB_HOST || 'localhost',
    port: parseInt(env.DOTCLOUD_DB_MONGODB_PORT) || 27017,
    user: env.DOTCLOUDJS_MONGO_USER || null,
    password: env.DOTCLOUDJS_MONGO_PWD || null,
    stackid: env.DOTCLOUDJS_STACKID || null
};

console.log(dbConfig);

db = require("./connectors/db")(app, dbConfig);

// Public modules instantiation
try {
    var publicModules = fs.readdirSync("./public/modules");
    for(var i=0; i<publicModules.length; i++) {
        if (publicModules[i].lastIndexOf('.js') === publicModules[i].length - 3)
            require("./public/modules/" + publicModules[i])(app, db, env);
    }
} catch (e) {
    console.log('No public modules directory');
}

// dotcloud.js Modules instantiation
stack.io({ registrar: REGISTRAR_ENDPOINT }, function(err, client) {
    if (err) throw err;

    function endpoint(module) {
        return env[module.toUpperCase() + '_ENDPOINT'];
    }

    if (CENTRALIZE) {
        var submodules = fs.readdirSync('./modules');
        for (var i = 0; i < submodules.length; i++) {
            var module = submodules[i];
            if (module.lastIndexOf('.js') === module.length - 3) {
                module = module.slice(0, module.length - 3);
                console.log('Initializing submodule: ', module);
                client.expose(module, endpoint(module),
                    require('./modules/' + module)(db));
            }
        }
        console.log('All modules loaded');
    }

    // Module routes
    function declareRoute(module, endpoint, method, procedure) {
        app[method]('/' + module + '/' + endpoint, function(req, res) {
            var params = Object.keys(req.params).reduce(function(prev, item) {
                prev[item] = req.params[item];
                return prev;
            }, {});
            client.call(module, procedure)({
                params: params, body: req.body, query: req.query
            }, function(err, r) {
                if (err)
                    res.send(err, 500);
                else
                    res.send(r.msg, r.code || 200); });
        });
    }

    var routes = JSON.parse(fs.readFileSync('./modules/routes.json'));
    console.log('Instantiating routes');
    for (var module in routes) {
        console.log('# Routes for ' + module);
        for (var endpoint in routes[module]) {
            console.log('   - ' + endpoint, ': ', routes[module][endpoint]);
            declareRoute(module, endpoint, routes[module][endpoint].method,
                routes[module][endpoint].procedure);
        }
    }

    // DEM HAXX
    // PLZ FIX STACK.IO CLIENT
    // LOLKTHX
    var interval = setInterval(function() {
        client._updateSvcList(function(err) {
            if (err)
                console.error(err);
        });
    }, 4000);

    setTimeout(function() {
        clearInterval(interval);
    }, 80000);

}).on('error', function(err) {
    console.error(err);
});;

// This shouldn't be here but for now it's convenient (CORS on config routes)
app.all('/twitter/set_keys', function(req, res, next) {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
});

app.all('/twilio/setup', function(req, res, next) {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
});
// -------------

// Version endpoint
app.get('/version', function(req, res) {
    res.send('0.91');
});

// stack.io listening
io.listen();

app.listen(env.PORT_WWW || 12864);
console.log("Express server listening on port %d in %s mode", app.address().port, app.settings.env);
