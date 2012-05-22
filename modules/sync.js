module.exports = function(app, mongo, redisUrl) {
    var io = require('stack.io')({
        transport: redisUrl
    }),
        redis = require('redis'),
        url = require('url'),
        _ = require('underscore');

    var parsedUrl = redisUrl? url.parse(redisUrl) : {};

    var redisClient = redis.createClient(parsedUrl.port, parsedUrl.hostname);
    if (parsedUrl.auth) {
        redisClient.auth(parsedUrl.auth.slice(parsedUrl.auth.indexOf(':') + 1));
    }

    var ns = function(dbid, collection) {
        return dbid + '.' + collection;
    };

    var db = function(ns) {
        return mongo.operations.collection(mongo.public(), ns);
    };

    io.expose('sync-redis', {
        push: function(dbid, collection, object, cb) {
            var ns = dbid + ':' + collection;
            var callback = function(err, data) {
                if (err) {
                    console.error(err);
                    return cb([err]);
                }
                io.emit('inserted-' + ns, object, 'push');
                cb([null, data]);
            };
            var rpushArgs;

            if (object instanceof Array) {
                rpushArgs = _.map(object, function(item) {
                    return JSON.stringify(item);
                });
                rpushArgs.unshift('public:' + ns);
                rpushArgs.push(callback);
            } else {
                rpushArgs = ['public:' + ns, JSON.stringify(object), callback];
            }

            redisClient.rpush.apply(redisClient, rpushArgs);
        },
        pop: function(dbid, collection, cb) {
            var ns = dbid + ':' + collection;
            redisClient.rpop('public:' + ns, function(err, data)  {
                if (err) {
                    console.error(err);
                    return cb([err]);
                }
                var obj = JSON.parse(data);
                io.emit('removed-' + ns, obj, 'pop');
                cb([null, obj]);
            });
            
        },
        shift: function(dbid, collection, cb) {
            var ns = dbid + ':' + collection;
            redisClient.lpop('public:' + ns, function(err, data)  {
                if (err) {
                    console.error(err);
                    return cb([err]);
                }
                var obj = JSON.parse(data);
                io.emit('removed-' + ns, obj, 'shift');
                cb([null, obj]);
            });
        },
        unshift: function(dbid, collection, object, cb) {
            var ns = dbid + ':' + collection;
            var callback = function(err, data) {
                if (err) {
                    console.error(err);
                    return cb([err]);
                }
                io.emit('inserted-' + ns, object, 'unshift');
                cb([null, data]);
            };
            var lpushArgs;

            if (object instanceof Array) {
                lpushArgs = _.map(object, function(item) {
                    return JSON.stringify(item);
                });
                lpushArgs.unshift('public:' + ns);
                lpushArgs.push(callback);
            } else {
                lpushArgs = ['public:' + ns, JSON.stringify(object), callback];
            }

            redisClient.lpush.apply(redisClient, lpushArgs);
        },
        splice: function(dbid, collection, idx, num, objects, cb) {
            var ns = dbid + ':' + collection,
                key = 'public:' + ns;

            var trx = redisClient.multi();

            function insert() {
                redisClient.lindex(key, idx, function(err, data) {
                    if (err) {
                        console.error(err);
                        return cb([err]);
                    }

                    for (var i = objects.length - 1; i >= 0; i--) {
                        trx.linsert(key, 'AFTER', data, JSON.stringify(objects[i]));
                    }

                    trx.exec(function(err, results) {
                        if (err) {
                            console.error(err);
                            return cb([err]);
                        }
                        cb([null, results]);
                        io.emit('spliced-' + ns, idx, num, objects);
                    });
                });
            }

            if (num !== 0) {
                var rnd = Math.ceil(Math.random() * 8192);
                for (var i = idx; i < idx + num; i++) {
                    trx.lset(key, i, "$$__TODELETE__" + rnd);
                }
                trx.lrem(key, 0, "$$__TODELETE__" + rnd);
                insert();
            } else {
                insert();
            }
        },
        retrieve: function(dbid, collection, cb) {
            var ns = dbid + ':' + collection;
            redisClient.lrange('public:' + ns, 0, -1, function(err, data) {
                if (err) {
                    console.error(err);
                    return cb([err]);
                }
                cb([null, _.map(data, function(item) {
                    try {
                        return JSON.parse(item);
                    } catch (e) {
                        console.error('JSON parse error', e, item);
                        return '';
                    }
                })]);
            });
        },

        update: function(dbid, collection, index, obj, cb) {
            var ns = dbid + ':' + collection;
            redisClient.lset('public:' + ns, index, JSON.stringify(obj), function(err, data) {
                if (err) {
                    console.error(err);
                    return cb([err]);
                }
                cb([null, data]);
                io.emit('updated-' + ns, index, obj);
            });
        }
    });

    io.expose('sync', {
        add: function(dbid, collection, object, cb) {
            var c = db(ns(dbid, collection));
            // above method already treats Array inserts as inserting each 
            // element of the array.
            mongo.operations.insert(c, object, function(err, data) {
                cb([err, data]);
                if (!err) {
                    io.emit('inserted-' + ns(dbid, collection), data);
                } else {
                    console.error(err);
                }
            });
        },
        remove: function(dbid, collection, id, cb) {
            var c = db(ns(dbid, collection));
            var callback = function(err, data) {
                if (err) {
                    console.error(err);
                    return cb([err]);
                }
                if (id) 
                    io.emit('removed-' + ns(dbid, collection), id);
                else
                    io.emit('removedall-' + ns(dbid, collection));
                return cb([null, data]);
            };
            if (id)
                mongo.operations.removeById(c, id, callback);
            else
                mongo.operations.removeAll(c, callback);
        },

        retrieve: function(dbid, collection, cb) {
            var c = db(ns(dbid, collection));
            mongo.operations.findAll(c, function(err, data) {
               if (err) {
                    console.error(err);
                }

               cb([err, data]);
            });
        },

        update: function(dbid, collection, id, changes, cb) {
            var c = db(ns(dbid, collection));
            var callback = function(err, data) {
                if (err) {
                    console.error(err);
                    return cb([err]);
                }
                io.emit('updated-' + ns(dbid, collection), data);
                return cb([null, data]);
            };
            mongo.operations.updateById(c, id, changes, callback);
        }
    });

    io.browser(app);
};