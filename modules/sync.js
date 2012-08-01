module.exports = function(mongo) {
    var _ = require('underscore'),
        evts = require('events'),
        syncEvts = new evts.EventEmitter();

    var proxy = function(cb) {
        return function(error, data, streaming) {
            if (data && data._id) {
                data._id = data._id.toString();
            } else if (data && data.data && data.data._id) {
                data.data._id = data.data._id.toString();
            } else if (data && data.constructor == Array) {
                data.forEach(function(x) { x._id = x._id ? x._id.toString() : undefined });
            } else if (data && data.data && data.data.constructor == Array) {
                data.data.forEach(function(x) { x._id = x._id ? x._id.toString() : undefined });
            }
            try {
                return cb ? cb(error, data, streaming) : undefined;
            } catch (e) {
                // We're probably trying to stream to a dead client.
                // Ignore for now.
                // TODO: Close connection and stop trying to send messages when this occurs.
            }
        };
    };

    var ns = function(dbid, collection) {
        return dbid + '.' + collection;
    };

    var db = function(ns, callback) {
        mongo.operations.collection('public', ns, callback);
    };

    return {
        add: function(dbid, collection, object, cb) {
            db(ns(dbid, collection), function(err, c) {
                if (err) {
                    console.error(err);
                    return proxy(cb)(err, null);
                }
                // method below already treats Array inserts as inserting each
                // element of the array.
                mongo.operations.insert(c, object, function(err, data) {
                    proxy(cb)(err, data);
                    if (!err) {
                        syncEvts.emit('inserted-' + ns(dbid, collection), data);
                    } else {
                        console.error(err);
                    }
                });
            });
        },
        remove: function(dbid, collection, id, cb) {
            var callback = function(err, data) {
                if (err) {
                    console.error(err);
                    return proxy(cb)(err);
                }
                if (id) 
                    syncEvts.emit('removed-' + ns(dbid, collection), id);
                else
                    syncEvts.emit('removedall-' + ns(dbid, collection));
                return proxy(cb)(null, data);
            };

            db(ns(dbid, collection), function(err, c) {
                if (err) {
                    console.erorr(err);
                    return proxy(cb)(err, null);
                }

                if (id)
                    mongo.operations.removeById(c, id, callback);
                else
                    mongo.operations.removeAll(c, callback);

            });
        },

        retrieve: function(dbid, collection, cb) {
            db(ns(dbid, collection), function(err, c) {
                if (err) {
                    console.log(err);
                    return proxy(cb)(err);
                }

                mongo.operations.findAll(c, function(err, data) {
                    if (err) {
                        console.error(err);
                    }

                    syncEvts.on('removed-' + ns(dbid, collection), function(id) {
                        proxy(cb)(null, {
                            type: 'removed',
                            data: id
                        }, true);
                    });

                    syncEvts.on('removedall-' + ns(dbid, collection), function() {
                        proxy(cb)(null, {
                            type: 'removed-all'
                        }, true);
                    });

                    syncEvts.on('inserted-' + ns(dbid, collection), function(data) {
                        proxy(cb)(null, {
                            type: 'inserted',
                            data: data
                        }, true);
                    });

                    syncEvts.on('updated-' + ns(dbid, collection), function(data) {
                        proxy(cb)(null, {
                            type: 'updated',
                            data: data
                        }, true);
                    });

                   proxy(cb)(err, { type: 'synchronized', data: data }, true);
                });
            });
        },

        update: function(dbid, collection, id, changes, cb) {
            db(ns(dbid, collection), function(err, c) {
                if (err) {
                    console.log(err);
                    return proxy(cb)(err);
                }
                var callback = function(err, data) {
                    if (err) {
                        console.error(err);
                        return proxy(cb)(err);
                    }
                    syncEvts.emit('updated-' + ns(dbid, collection), data);
                    return proxy(cb)(null, data);
                };
                mongo.operations.updateById(c, id, changes, callback);
            });
        }
    };
};