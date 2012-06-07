var express = require('express');
var app = module.exports = express.createServer();

var fs = require('fs');
try {
    var env = JSON.parse(fs.readFileSync('/home/dotcloud/environment.json'));
} catch (e) {
    env = process.env;
}

// Configuration

app.configure(function(){
    app.use(express.bodyParser());
    app.use(express.methodOverride());
    app.use(express.cookieParser());
    app.use(express.session({ secret: "__session_secret__" }));
    app.use(app.router);
});

app.configure('development', function(){
    app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
});

app.configure('production', function(){
    app.use(express.errorHandler());
});

var db, dbConfig = {
    host: env.DOTCLOUD_DB_MONGODB_HOST || 'localhost',
    port: env.DOTCLOUD_DB_MONGODB_PORT || 27017
};

if (env.DOTCLOUDJS_IS_PUBLIC) {
    console.log("Using public profile");

    var publicModules = fs.readdirSync("./public/modules");

    dbConfig.user = env.DOTCLOUDJS_MONGO_USER;
    dbConfig.password = env.DOTCLOUDJS_MONGO_PWD;
    db = require("./public/connectors/db")(app, dbConfig);

    for(var i=0; i<publicModules.length; i++) {
        require("./public/modules/" + publicModules[i])(app, db, env);
    }

} else {
    console.log("Using private profile");

    app.use(express['static'](__dirname + "/static"));
    dbConfig.user = env.DOTCLOUD_DB_MONGODB_LOGIN;
    dbConfig.password = env.DOTCLOUD_DB_MONGODB_PASSWORD;
    dbConfig.stackid = env.DOTCLOUDJS_STACKID;
    db = require("./connectors/db")(app, dbConfig);
}

var submodules = fs.readdirSync('./modules');
for (var i = 0; i < submodules.length; i++) {
    console.log('Initializing submodule: ', submodules[i]);
    require('./modules/' + submodules[i])(app, db, env.DOTCLOUD_STORE_REDIS_URL);
}

app.get('/version', function(req, res) {
    res.send('0.73');
});

app.listen(env.PORT_WWW || 12864);
console.log("Express server listening on port %d in %s mode", app.address().port, app.settings.env);
