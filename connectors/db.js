var http = require("http"),
    qs = require("querystring");

module.exports = function(app, connection) {
    var mongo = require('../lib/node-mongodb-wrapper');
    var _ = require('underscore');

    var error = function(res, err, log, code) {
        if (log) console.error(err);
        res.send({ error: err }, code || 200);
    };

    var pool = {
        _pool: {},
        get: function(dbid) {
            if (this._pool[dbid]) {
                return this._pool[dbid].db;
            }
            var that = this;
            this._pool[dbid] = {
                db: mongo.db(connection.host, connection.port, dbid, null, 
                    { user: connection.user, password: connection.password }),
                clean: _.debounce(function() { that._pool[dbid].db.close(); delete that._pool[dbid]; }, 
                    6000000)
            };
            this._pool[dbid].db.keepOpen();
            this._pool[dbid].clean();
            return this._pool[dbid].db;
        }
    };

    var operations = {
        findById: function(collection, id, cb) {
            collection.findOne({ _id: new mongo.ObjectID(id) }, cb);
        },
        findAll: function(collection, cb) {
            collection.find({}).toArray(cb);
        },
        insert: function(collection, obj, cb) {
            if (obj instanceof Array) {
                var result = [], errors = [];
                cb = _.after(obj.length, cb);
                var fn = function(err, data) {
                    if (err) errors.push(err);
                    if (data) result.push(data);
                    cb(errors.length ? errors : null, result);
                };

                for (var i = 0; i < obj.length; i++) {
                    collection.save(obj[i], fn);
                }

            } else {
                collection.save(obj, cb);
            }
        },
        update: function(collection, conditions, changes, multi, cb) {
            if (changes._id) changes._id = new mongo.ObjectID(changes._id);
            collection.update(conditions, changes, false, multi, cb);
        },
        updateById: function(collection, id, changes, cb) {
            if (changes._id) changes._id = new mongo.ObjectID(changes._id);
            collection.findAndModify({
                query: { _id: new mongo.ObjectID(id) },
                update: changes,
                'new': true
            }, cb);
        },
        upsert: function(collection, conditions, obj, cb) {
            if (obj._id) obj._id = new mongo.ObjectID(obj._id);
            collection.update(conditions, obj, true, false, cb);
        },
        removeById: function(collection, id, cb) {
            collection.remove({ _id: new mongo.ObjectID(id) }, cb);
        },
        removeAll: function(collection, cb) {
            collection.remove({}, cb);
        },
        query: function(collection, query, cb) {
            collection.find(query).toArray(cb);
        },
        collection: function(db, collection) {
            return db.collection(collection);
        }
    };

    this.midGetDb = function(req, res, next) {
        var dbid = req.param('dbid', null);
        if (dbid && dbid == connection.stackid) {
            req.db = pool.get('admin');
            next();
        } else {
            error(res, 'You must provide a valid dbid');
        }
    };
    
    app.all('/rpc/newdb', function(req, res, next) {
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Headers', 'Content-Type');
        next();
    });

    app.post('/rpc/newdb', function(req, res) {
        var stackid = req.param('stackid', null);
        if (stackid === connection.stackid && (stackid !== '_private')) {
            res.send({ result: { id: stackid}});
        } else {
            error(res, "Unauthorized stackid: " + stackid, true, 403);
        }
    });

    this.operations = operations;
    this['public'] = function() { return pool.get('admin'); };

    return this;
};