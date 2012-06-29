module.exports = function(app, connection) {
    var mongo = require('mongodb'),
        _ = require('underscore'),
        evts = require('events'),
        emitter = new evts.EventEmitter();

    var error = function(res, err, log, code) {
        if (log) console.error(err);
        res.send({ error: err }, code || 200);
    };

    var db = function(name, connection,callback) {
        var db = new mongo.Db(name, new mongo.Server(connection.host, connection.port, {}), {});
        db.open(function(err) {
            if (err) {
                emitter.emit('error', { db: name, type: 'connection', error: err });
                return callback(err);
            }
            db.authenticate(connection.user, connection.password, function(err) {
                if (err) 
                    emitter.emit('error', { db: name, type: 'auth', error: err });
                callback(err, db);
            });
        });
    }

    var objectID = function(hexId) {
        return mongo.ObjectID.createFromHexString(hexId);
    }

    var pool = {
        _pool: {},
        get: function(dbid, callback) {
            var that = this;

            if (this._pool[dbid]) {
                return callback && callback(null, this._pool[dbid]);
            }

            db(dbid, connection, function(err, database) {
                if (err) {
                    return callback && callback(err);
                }
                that._pool[dbid] = database;
                callback && callback(null, database);
            })
        },
        getDb: function(params, cb) {
            this.get('sys', function(err, db) {
                if (err) return cb(err);
                db.collection('dbIds', function(err, collection) {
                    if (err) return cb(err);
                    collection.findOne({ stackid: params.stackid }, function(err, data) {
                        if (err) return cb(err);
                        if (!data) {
                            collection.save({ stackid: params.stackid }, function(err, id) {
                                if (err) return cb(err);
                                return cb(null, 'db' + id._id);
                            });
                        } else {
                            return cb(null, 'db' + data._id);
                        }
                    });
                });
            });
            
        }
    };

    emitter.on('error', function(err) {
        console.error('DB error! Type: ', err.type, ' on db: ', err.db, ' message: ', err.error);
    });

    var operations = {
        findById: function(collection, id, cb) {
            collection.findOne({ _id: objectID(id) }, cb);
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
            if (changes._id) changes._id = objectID(changes._id);
            collection.update(conditions, changes, { multi: multi }, cb);
        },
        updateById: function(collection, id, changes, cb) {
            console.log('update by id...');
            if (changes._id) {
                console.log('objectID(changes._id)');
                changes._id = objectID(changes._id);
                console.log('done');
            }
            console.log('findAndModify...');
            collection.findAndModify({ _id: objectID(id) }, "_id", 
                changes, { 'new': true }, cb);
            console.log('done');
        },
        upsert: function(collection, conditions, obj, cb) {
            if (obj._id) obj._id = objectID(obj._id);
            collection.update(conditions, obj, { upsert: true }, cb);
        },
        removeById: function(collection, id, cb) {
            collection.remove({ _id: objectID(id) }, cb);
        },
        removeAll: function(collection, cb) {
            collection.remove({}, cb);
        },
        query: function(collection, query, cb) {
            collection.find(query).toArray(cb);
        },
        collection: function(db, collection, cb) {
            if (typeof db === 'string') {
                pool.get(db, function(err, db) {
                    if (err) return cb(err);
                    db.collection(collection, cb)
                })
            } else {
                db.collection(collection, cb);
            }
            
        }
    };

    if (app) {
        app.all('/rpc/newdb', function(req, res, next) {
            res.header('Access-Control-Allow-Origin', '*');
            res.header('Access-Control-Allow-Headers', 'Content-Type');
            next();
        });

        app.post('/rpc/newdb', function(req, res) {
            var stackid = req.param('stackid', null);
            if ((!connection.stackid || stackid === connection.stackid) && (stackid !== '_private')) {
                pool.getDb({ stackid: stackid }, function(err, id) {
                    if (err) return error(res, err, true);
                    res.send({ result: { id: id } });
                });
            } else {
                error(res, "Unauthorized stackid: " + stackid, true, 403);
            }
        });
    }

    this.operations = operations;
    this['public'] = function(callback) { pool.get('public', callback); };
    this.sys = function(callback) { pool.get('sys', callback); };

    pool.get('public');
    pool.get('sys');

    return this;
};