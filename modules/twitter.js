module.exports = function(app, mongo, redisUrl) {
    var twitter = require('../connectors/twitter'),
        io = require('stack.io')({
            transport: redisUrl
        });

    var registrar = {};

    var isId = function(x) {
        return (typeof x == 'number') || (/^[0-9]+$/.test(x));
    }

    var insertUserInParams = function(user, params, prefix) {
        params = params || {};

        if (user === null || user === undefined) {
            return params;
        } 

        if (user.charAt(0) == '@') {
            params[(prefix || '') + 'screen_name'] = user.substring(1);
            return params;
        }

        if (isId(user)) {
            params[(prefix || 'user_') + 'id'] = user;
        } else {
            params[(prefix || '') + 'screen_name'] = user;
        }
        return params;
    }

    var appService = function(twitterApp) {
        return {
            // ## REST API
            // ### Timelines
            timeline: function(auth, type, params, cb) {
                if (typeof type == 'function') {
                    params = null, cb = type;
                } else if (typeof type == 'object' && typeof params == 'function') {
                    cb = params, params = type;
                } else if (typeof params == 'function') {
                    cb = params, params = null;
                }

                if (type == 'user') {
                    twitterApp.get('/statuses/user_timeline.json', params, auth, cb);
                } else {
                    twitterApp.get('/statuses/home_timeline.json', params, auth, cb);
                }
            },
            mentions: function(auth, params, cb) {
                twitterApp.get('/statuses/mentions.json', params, auth, cb);
            },
            retweetsTimeline: function(auth, type, user, params, cb) {
                if (typeof user == 'object' && typeof params == 'function') {
                    cb = params, params = user;
                } else {
                    params = insertUserInParams(user, params);
                }

                if (type == 'by') {
                    twitterApp.get('/statuses/' + (user == 'me' ? 'retweeted_by_me.json' : 'retweeted_by_user.json'), params, auth, cb);
                } else if (type == 'to') {
                    twitterApp.get('/statuses/' + (user == 'me' ? 'retweeted_to_me.json' : 'retweeted_to_user.json'), params, auth, cb);
                } else if (type == 'of') {
                    twitterApp.get('/statuses/retweets_of_me.json', params, auth, cb);
                } else {
                    cb({ statusCode: 400, errors: ['Type must be one of [by, to, of]'] });
                }
            },

            // ### Statuses
            retweeters: function(auth, id, ids, params, cb) {
                twitterApp.get('/statuses/' + id + '/retweeted_by' + (ids ? '/ids.json' : '.json'), params, auth, cb);
            },
            retweets: function(auth, id, params, cb) {
                twitterApp.get('/statuses/retweets/' + id + '.json', params, auth, cb);
            },
            showStatus: function(auth, id, params, cb) {
                twitterApp.get('/statuses/show/' + id + '.json', params, auth, cb);
            },
            destroyStatus: function(auth, id, cb) {
                twitterApp.post('/statuses/destroy/' + id + '.json', null, auth, cb);
            },
            updateStatus: function(auth, status, params, cb) {
                params.status = status;
                twitterApp.post('/statuses/update.json', params, auth, cb);
            },
            retweetStatus: function(auth, id, cb) {
                twitterApp.post('/statuses/retweet/' + id + '.json', null, auth, cb);
            },

            // ### Direct messages
            receivedDMs: function(auth, params, cb) {
                twitterApp,get('/direct_messages.json', params, auth, cb);
            },
            sentDMs: function(auth, params, cb) {
                twitterApp,get('/direct_messages/sent.json', params, auth, cb);
            },
            destroyDM: function(auth, id, cb) {
                twitterApp,post('/direct_messages/destroy/' + id + '.json', params, auth, cb);
            },
            newDM: function(auth, user, text, cb) {
                var params = insertUserInParams(user, { text: text });
                twitterApp.post('/direct_messages/new.json', params, auth, cb);
            },
            showDM: function(auth, id, cb) {
                twitterApp.get('/direct_messages/show/' + id + '.json', null, auth, cb);
            },

            // ### Friends/followers
            followers: function(auth, user, params, cb) {
                if (typeof params == 'function') {
                    cb = params, params = null;
                }

                params = params || {};
                params.stringify_ids = true;

                twitterApp.get('/followers/ids', insertUserInParams(user, params), auth, cb);
            },
            friends: function(auth, user, params, cb) {
                if (typeof params == 'function') {
                    cb = params, params = null;
                }

                params = params || {};
                params.stringify_ids = true;

                twitterApp.get('/friends/ids', insertUserInParams(user, params), auth, cb);
            },
            areFriends: function(auth, userA, userB, cb) {
                var params = {};

                if (isId(userA)) {
                    params.user_id_a = userA;
                } else {
                    params.screen_name_a = userA;
                }

                if (isId(userB)) {
                    params.user_id_b = userB;
                } else {
                    params.screen_name_b = userB;
                }

                twitterApp.get('/friendships/exists.json', params, auth, cb);
            },
            friendshipsIn: function(auth, params, cb) {
                twitterApp.get('/friendships/incoming.json', null, auth, cb);
            },
            friendshipsOut: function(auth, params, cb) {
                twitterApp.get('/friendships/outgoing.json', null, auth, cb);
            },
            showFriendship: function(auth, source, target, cb) {
                twitterApp.get('/friendships/show.json', params, auth, cb);
            },
            createFriendship: function(auth, user, follow, cb) {
                var params = insertUserInParams(user, { follow: follow });
                twitterApp.post('/friendships/create.json', params, auth, cb);
            },
            destroyFriendship: function(auth, user, cb) {
                twitterApp.post('/friendships/destroy.json', insertUserInParams(user), 
                    auth, cb);
            },
            lookupFriendships: function(auth, users, cb) {
                if (!Array.isArray(users) && users.length > 0 && users.length <= 100) {
                    cb({ 
                        statusCode: 400, 
                        data: 'First parameter must be an array of 1-100 user_ids or screen_names' 
                    });
                }

                var ids = (isId(users[0]));
                var users = users.join(',');
                twitterApp.get('/friendships/lookup.json', { 
                    user_id: ids? users : undefined,
                    screen_name: ids? undefined: users
                }, auth, cb);
            },
            updateFriendship: function(auth, user, device, retweets, cb) {
                var params = insertUserInParams(user, {
                    device : device,
                    retweets : retweets
                });

                twitterApp.post('/friendships/update.json', params, auth, cb);
            },

            // ### Users
            lookupUsers: function(auth, users, cb) {
                if (!Array.isArray(users) && users.length > 0 && users.length <= 100) {
                    cb({ 
                        statusCode: 400, 
                        data: 'First parameter must be an array of 1-100 user_ids or screen_names' 
                    });
                }

                var ids = isId(users[0]);
                var users = users.join(',');
                twitterApp.get('/users/lookup.json', { 
                    user_id: ids? users : undefined,
                    screen_name: ids? undefined: users
                }, auth, cb);
            },
            searchUsers: function(auth, query, params, cb) {
                params.q = query;
                twitterApp.get('/users/search.json', params, auth, cb);
            },
            showUser: function(auth, user, cb) {
                twitterApp.get('/users/show.json', insertUserInParams(user), 
                    auth, cb);
            },
            contributees: function(auth, user, params, cb) {
                params = insertUserInParams(user, params);
                twitterApp.get('/users/contributees.json', params, auth, cb);
            },
            contributors: function(auth, user, params, cb) {
                params = insertUserInParams(user, params);
                twitterApp.get('/users/contributors.json', params, auth, cb);
            },
            suggestionCategories: function(auth, lang, cb) {
                if (typeof lang == 'function') {
                    cb = lang, lang = undefined;
                }
                twitterApp.get('/users/suggestions.json', { lang: lang }, auth, cb);
            },
            suggestions: function(auth, slug, members, lang, cb) {
                if (typeof lang == 'function') {
                    if (members === true || members === false) {
                        cb = lang, lang = undefined;
                    } else {
                        cb = lang, lang = members, members = false;
                    }
                } else if (typeof members == 'function') {
                    cb = members, members = undefined;
                }

                twitterApp.get('/users/suggestions/' + slug + 
                        (members ? '/members.json' : '.json'),
                    { lang : lang }, auth, cb);
            },

            // ### Block
            blocking: function(auth, params, ids, cb) {
                if (typeof ids === 'function') {
                    if (params === true || params === false) {
                        cb = ids, ids = params, params = {};
                    } else {
                        cb = ids, ids = false;
                    }
                } else if (typeof params == 'function') {
                    cb = params, params = {};
                }

                if (!ids) {
                    twitterApp.get('/blocks/blocking.json', params, auth, cb);
                } else {
                    params.stringify_ids = true;
                    twitterApp.get('/blocks/blocking/ids.json', params, auth, cb);
                }
            },
            isBlocked: function(auth, user, params, cb) {
                if (typeof params == 'function') {
                    cb = params, params = null;
                }

                params = insertUserInParams(user, params);
                twitterApp.get('/blocks/exists.json', params, auth, cb);
            },
            createBlock: function(auth, user, params, cb) {
                if (typeof params == 'function') {
                    cb = params, params = null;
                }

                params = insertUserInParams(user, params);
                twitterApp.post('/blocks/create.json', params, auth, cb);
            },
            destroyBlock: function(auth, user, params, cb) {
                if (typeof params == 'function') {
                    cb = params, params = null;
                }

                params = insertUserInParams(user, params);
                twitterApp.post('/blocks/destroy.json', params, auth, cb);
            },

            // ### Favorites
            favorites: function(auth, user, params, cb) {
                var userType = typeof user;
                if (user == 'me') {
                    user = null;
                } else if ((typeof params == 'function') && (userType == 'object')) {
                    cb = params, params = user;
                } else {
                    insertUserInParams(user, params);
                }

                twitterApp.get('/favorites.json', params, auth, cb);
            },
            createFavorite: function(auth, id, cb) {
                twitterApp.post('/favorites/create/' + id + '.json', null, auth, cb);
            },
            destroyFavorite: function(auth, id, cb) {
                twitterApp.post('/favorites/destroy/' + id + '.json', null, auth, cb);
            },

            // ### Lists
            allLists: function(auth, user, cb) {
                if (typeof user == 'function') {
                    cb = user, user = null;
                }

                twitterApp.get('/lists/all.json', insertUserInParams(user), cb);
            },

            listStatuses: function(auth, list, owner, params, cb) {
                var listId = isId(list);
                if (typeof params == 'function') {
                    cb = params, params = null;
                } else if (listId && typeof owner == 'function') {
                    cb = owner, owner = null;
                }

                if (listId && typeof owner == 'object') {
                    params = owner, owner = null;
                }

                params = insertUserInParams(owner, params, 'owner_');
                params.list_id = listId ? list : null;
                params.slug = listId ? null : list;
                twitterApp.get('/lists/statuses.json', params, auth, cb);
            },

            listSubscriptions: function(auth, user, params, cb) {
                if (typeof params == 'function') {
                    cb = params, params = null;
                }
                params = insertUserInParams(user, params);
                twitterApp.get('/lists/subscriptions.json', params, auth, cb);
            },

            listSubscribers: function(auth, list, owner, params, cb) {
                var listId = isId(list);
                if (typeof params == 'function') {
                    cb = params, params = null;
                } else if (listId && typeof owner == 'function') {
                    cb = owner, owner = null;
                }

                if (listId && typeof owner == 'object') {
                    params = owner, owner = null;
                }

                params = insertUserInParams(owner, params, 'owner_');
                params.list_id = listId ? list : null;
                params.slug = listId ? null : list;
                twitterApp.get('/lists/subscribers.json', params, auth, cb);
            },

            listSubscribe: function(auth, list, owner, cb) {
                var listId = isId(list);
                if (listId && typeof owner == 'function') {
                    cb = owner, owner = null;
                }
                params = insertUserInParams(owner, params, 'owner_');
                params.list_id = listId ? list : null;
                params.slug = listId ? null : list;
                twitterApp.post('/lists/subscribers/create.json', params, auth, cb);
            },

            isListSubscriber: function(auth, list, owner, user, params, cb) {
                var listId = isId(list);
                if (typeof params == 'function') {
                    cb = params, params = null;
                } else if (listId && typeof user == 'function') {
                    cb = user, user = owner, owner = null;
                }

                params = insertUserInParams(owner, params, 'owner_');
                params = insertUserInParams(user, params);
                params.list_id = listId ? list : null;
                params.slug = listId ? null : list;
                twitterApp.get('/lists/subscribers/show.json', params, auth, cb);
            },

            listUnsubscribe: function(auth, list, owner, cb) {
                var listId = isId(list);
                if (listId && typeof owner == 'function') {
                    cb = owner, owner = null;
                }

                params = insertUserInParams(owner, params, 'owner_');
                params.list_id = listId ? list : null;
                params.slug = listId ? null : list;
                twitterApp.post('/lists/subscribers/destroy.json', params, auth, cb);
            },

            listMemberships: function(auth, user, params, cb) {
                if (typeof user == 'function') {
                    cb = user, user = null;
                } else if (typeof params == 'function') {
                    cb = params;
                    if (typeof user == 'object') {
                        params = user, user = null;
                    } else {
                        params = null;
                    }
                }

                params = insertUserInParams(user, params);
                twitterApp.get('/lists/memberships.json', params, auth, cb);
            },

            listMembers: function(auth, list, owner, params, cb) {
                var listId = isId(list);
                if (typeof params == 'function') {
                    cb = params, params = null;
                } else if (listId && typeof owner == 'function') {
                    cb = owner, owner = null;
                }

                if (listId && typeof owner == 'object') {
                    params = owner, owner = null;
                }

                params = insertUserInParams(owner, params, 'owner_');
                params.list_id = listId ? list : null;
                params.slug = listId ? null : list;
                twitterApp.get('/lists/members.json', params, auth, cb);
            },

            addMember: function(auth, list, owner, user, cb) {
                var listId = isId(list);
                if (listId && typeof user == 'function') {
                    cb = user, user = owner, owner = null;
                }

                if (Array.isArray(user)) {
                    if (isId(user[0])) {
                        params.user_id = user.join(',');
                    } else {
                        params.screen_name = user.join(',');
                    }
                } else {
                    params = insertUserInParams(user, params);
                }

                params = insertUserInParams(owner, params, 'owner_');
                params.list_id = listId ? list : null;
                params.slug = listId ? null : list;
                twitterApp.post('/lists/members/create' + 
                    (Array.isArray(user) ? '_all.json' : '.json'), params, auth, cb);
            },

            isListMember: function(auth, list, owner, user, params, cb) {
                var listId = isId(list);
                if (typeof params == 'function') {
                    cb = params, params = null;
                } else if (listId && typeof user == 'function') {
                    cb = user, user = owner, owner = null;
                }

                params = insertUserInParams(owner, params, 'owner_');
                params = insertUserInParams(user, params);
                params.list_id = listId ? list : null;
                params.slug = listId ? null : list;
                twitterApp.get('/lists/members/show.json', params, auth, cb);
            },

            removeListMember: function(auth, list, owner, user, cb) {
                var listId = isId(list);
                if (listId && typeof user == 'function') {
                    cb = user, user = owner, owner = null;
                }

                if (Array.isArray(user)) {
                    if (isId(user[0])) {
                        params.user_id = user.join(',');
                    } else {
                        params.screen_name = user.join(',');
                    }
                } else {
                    params = insertUserInParams(user, params);
                }

                params = insertUserInParams(owner, params, 'owner_');
                params.list_id = listId ? list : null;
                params.slug = listId ? null : list;
                twitterApp.post('/lists/members/destroy' + 
                    (Array.isArray(user) ? '_all.json' : '.json'), params, auth, cb);
            },

            createList: function(auth, name, mode, desc, cb) {
                if (typeof desc == 'function') {
                    cb = desc, desc = null;
                    if (mode != 'private' && mode != 'public') {
                        desc = mode, mode = null;
                    }
                } else if (typeof mode == 'function') {
                    cb = mode, mode = null;
                }

                var params = {
                    name: name,
                    mode: mode,
                    description: desc
                };

                twitterApp.post('/lists/create.json', params, auth, cb);
            },

            destroyList: function(auth, list, owner, cb) {
                var listId = isId(list);
                if (listId && typeof owner == 'function') {
                    cb = owner, owner = null; 
                }

                var params = {
                    list_id: listId ? list : null,
                    slug: listId ? null : list
                };
                params = insertUserInParams(owner, params, 'owner_');
                twitterApp.post('/lists/destroy.json', params, auth, cb);
            },

            updateList: function(auth, list, owner, update, cb) {
                var listId = isId(list);
                if (listId && typeof update == 'function') {
                    cb = update, update = owner, owner = null;
                }

                update = insertUserInParams(owner, update, 'owner_');
                update.list_id = listId ? list : null;
                update.slug = listId ? null : slug;
                twitterApp.post('/lists/update.json', update, auth, cb);
            },

            lists: function(auth, user, cursor, cb) {
                if (typeof cursor == 'function') {
                    cb = cursor, cursor = null;
                }
                var params = insertUserInParams(user, { cursor : cursor });

                twitterApp.get('/lists.json', params, auth, cb);
            },

            showList: function(auth, list, owner, cb) {
                var listId = isId(list);
                if (listId && typeof owner == 'function') {
                    cb = owner, owner = null;
                }

                var params = insertUserInParams(owner, null, 'owner_');

                params.list_id = listId ? list : null;
                params.slug = listId ? null : list;

                twitterApp.get('/lists/show.json', params, auth, cb);
            },

            // ### Accounts
            rateLimit: function(auth, cb) {
                twitterApp.get('/account/rate_limit_status.json', null, auth, cb);
            },
            verifyCredentials: function(auth, cb) {
                twitterApp.get('/account/verify_credentials.json', null, auth, cb);
            },
            endSession: function(auth, cb) {
                twitterApp.post('/account/end_session.json', null, auth, cb);
            },
            updateProfile: function(auth, params, cb) {
                twitterApp.post('/account/update_profile.json', params, auth, cb);
            },
            updateBackgroundImg: function(auth, image, params, cb) {
                if (typeof params == 'function') {
                    cb = params;
                    if (typeof image == 'string') {
                        params = {};
                    } else {
                        params = image, image = undefined;
                    }
                }
                params.image = image;

                twitterApp.post('/account/update_profile_background_image.json', params, auth, cb);
            },
            updateProfileImg: function(auth, image, params, cb) {
                if (typeof params == 'function') {
                    cb = params, params = {};
                }
                params.image = image;

                twitterApp.post('/account/update_profile_background_image.json', params, auth, cb);
            },
            updateProfileColors: function(auth, params, cb) {
                twitterApp.post('/account/update_profile_colors.json', params, auth, cb);
            },

            accountTotals: function(auth, cb) {
                twitterApp.get('/account/totals.json', auth, cb);
            },

            settings: function(auth, cb) {
                twitterApp.get('/account/settings.json', auth, cb);
            },

            updateSettings: function(auth, params, cb) {
                twitterApp.post('/accounts/settings.json', params, auth, cb);
            },

            // ### Notifications
            follow: function(auth, user, cb) {
                twitterApp.post('/notifications/follow.json', insertUserInParams(user), auth, cb);
            },
            leave: function(auth, user, cb) {
                twitterApp.post('/notifications/leave.json', insertUserInParams(user), auth, cb);
            },

            // ### Saved searches
            savedSearches: function(auth, cb) {
                twitterApp.get('/saved_searches.json', auth, cb);
            },
            showSavedSearch: function(auth, id, cb) {
                twitterApp.get('/saved_searches/show/' + id + '.json', auth, cb);
            },
            createSavedSearch: function(auth, query, cb) {
                twitterApp.post('/saved_searches/create.json', { query: query }, auth, cb);
            },
            destroySavedSearch: function(auth, id, cb) {
                twitterApp.post('/saved_searches/destroy/' + id + '.json', auth, cb);
            },

            // ### Geolocation
            geoId: function(auth, placeId, cb) {
                twitterApp.get('/geo/id/' + placeId + '.json', auth, cb);
            },
            reverseGeocode: function(auth, latitude, longitude, params, cb) {
                if (typeof params == 'function') {
                    cb = params, params = {};
                }

                params.lat = latitude, params['long'] = longitude;
                twitterApp.get('/geo/reverse_geocode.json', params, auth, cb);
            },
            searchGeo: function(auth, query, params, cb) {
                if (typeof params == 'function') {
                    cb = params, params = {};
                }

                if (/([0-2]?[0-9]{1,2}\.){3}[0-2]?[0-9]{1,2}/.test(query)) {
                    params.ip = query;
                } else if (query.latitude && query.longitude) {
                    params.lat = query.latitude, params['long'] = query.longitude;
                } else {
                    params.query = query;
                }

                twitterApp.get('/geo/search.json', params, auth, cb);
            },
            similarPlaces: function(auth, latitude, longitude, name, params, cb) {
                if (typeof params == 'function') {
                    cb = params, params = {};
                }

                params.lat = latitude, 
                params['long'] = longitude, 
                params.name = name;

                twitterApp.get('/geo/similar_places.json', params, auth, cb);
            },
            createPlace: function(auth, params, cb) {
                twitterApp.post('/geo/place.json', params, auth, cb);
            },

            // ### Trends
            trends: function(auth, woeid, exclude, cb) {
                if (typeof exclude == 'function') {
                    cb = exclude, exclude = null;
                }

                twitterApp.get('/trends/' + woeid + '.json', { exclude: exclude }, auth, cb);
            },
            availableTrends: function(auth, latitude, longitude, cb) {
                if (typeof latitude == 'function') {
                    cb = latitude, latitude = null;
                }

                twitterApp.get('/trends/available.json',
                    { lat: latitude, 'long': longitude }, auth, cb);
            },
            dailyTrends: function(auth, params, cb) {
                if (typeof params == 'function') {
                    cb = params, params = null;
                }

                twitterApp.get('/trends/daily.json', params, auth, cb);
            },
            weeklyTrends: function(auth, params, cb) {
                if (typeof params == 'function') {
                    cb = params, params = null;
                }

                twitterApp.get('/trends/weekly.json', params, auth, cb);
            },

            // ### Help
            test: function(auth, cb) {
                twitterApp.get('/help/test.json', null, auth, cb);
            },
            config: function(cb) {
                twitterApp.get('/help/configuration.json', cb);
            },
            languages: function(cb) {
                twitterApp.get('/help/languages.json', cb);
            },

            // ## Search API
            search: function(query, params, cb) {
                twitterApp.search(query, params, cb);
            },

            // ## Streaming API
            sampleStream: function(auth, params, cb) {
                if (typeof params == 'function') {
                    cb = params, params = null;
                }

                twitterApp.stream('statuses/sample', params, auth, function(stream) {
                    stream.on('data', function(d) {
                        cb(d, true);
                    });
                });
            },
            filteredStream: function(auth, params, cb) {
                twitterApp.stream('statuses/filter', params, auth, function(stream) {
                    stream.on('data', function(d) {
                        cb(d, true);
                    });
                });
            },
            firehose: function(auth, params, cb) {
                if (!cb && (typeof params == 'function')) {
                    cb = params, params = null;
                }
                twitterApp.stream('statuses/firehose', params, auth, function(stream) {
                    stream.on('data', function(d) {
                        cb(d, true);
                    });
                });
            },
            siteStream: function(auth, follow, params, cb) {
                if (!cb && (typeof params == 'function')) {
                    cb = params, params = {};
                }
                params.follow = follow;
                twitterApp.stream('site', params, auth, function(stream) {
                    stream.on('data', function(d) {
                        cb(d, true);
                    });
                });
            },
            userStream: function(auth, params, cb) {
                if (!cb && (typeof params == 'function')) {
                    cb = params, params = null;
                }
                twitterApp.stream('user', params, auth, function(stream) {
                    stream.on('data', function(d) {
                        cb(d, true);
                    });
                });
            },

            // ## OAuth
            requestToken: function(host, cb) {
                twitterApp.oauth.getOAuthRequestToken({
                    callback_url: host + '/twitter/callback'
                }, function(error, token, secret, authUrl, params) {
                    if (error) {
                        cb({ error: error });
                    } else {
                        cb({
                            token: token,
                            secret: secret,
                            authUrl: authUrl,
                            params: params
                        });
                    }
                });
            },

            accessToken: function(verifier, token, secret, cb) {
                twitterApp.oauth.getOAuthAccessToken(token, secret, verifier,
                    function(error, access_token_key, access_token_secret, params) {
                        var user_id = (params && params.user_id) || null,
                            screen_name = (params && params.screen_name) || null;

                        if ( error ) {
                            cb({ error: error });
                        } else {
                            cb({
                                user_id: user_id,
                                screen_name: screen_name,
                                access_token_key: access_token_key,
                                access_token_secret: access_token_secret,
                                key: access_token_key,
                                secret: access_token_secret,
                                appKey: twitterApp.options.consumer_key
                            });
                        }
                    });
            }
        };
    };

    var service = {
        init: function(key, secret, token, cb) {
            if (registrar['twitter-' + key])
                return cb('twitter-' + key);
            var collection = mongo.operations.collection(mongo.public(), '_private.twitter');

            if (!secret) {
                return mongo.operations.query(collection, { key: key }, function(error, data) {
                    if (error) {
                        return cb({ error: error });
                    } else if (!data || data.length === 0 || !data[0].secret) {
                        return cb({ error: 'Application was never registered. Please call init once providing your consumer secret.' });
                    }

                    io.expose('twitter-' + key, appService(twitter({
                        consumer_key: key,
                        consumer_secret: data[0].secret,
                        access_token_key: token? token.key : null,
                        access_token_secret: token? token.secret: null
                    })));
                    registrar['twitter-' + key] = true;
                    return cb('twitter-' + key);
                });
            }

            mongo.operations.query(collection, { key: key }, function(error, data) {
                if (error) {
                    return cb({ error : error });
                } else if (!data || data.length === 0) {
                    mongo.operations.insert(collection, { key: key, secret: secret }, function() {});
                } else if (!data[0].secret) {
                    mongo.operations.updateById(collection, data[0]._id.toString(), { $set: { secret: secret } }, function() {});
                }

                io.expose('twitter-' + key, appService(twitter({
                    consumer_key: key,
                    consumer_secret: secret,
                    access_token_key: token ? token.key : null,
                    access_token_secret: token ? token.secret : null
                })));
                registrar['twitter-' + key] = true;
                return cb('twitter-' + key);
            });
        }
    };

    io.expose('twitter', service);

    app.get('/twitter/callback', function(req, res) {
        res.send('<script type="text/javascript">\
            window.opener.postMessage(\'{ "token":"' + req.query.oauth_token +
            '", "verifier":"' + req.query.oauth_verifier + '"}\', "*");\
            window.close();</script>');

    });

    app.post('/twitter/set_keys', function(req, res) {
        var secret = req.param('secret', null),
            key = req.param('key', null),
            old = req.param('old_secret', null);
        var collection = mongo.operations.collection(mongo.public(), '_private.twitter');

        if (!secret || !key) {
            res.send('You must provide a "key" parameter and a "secret" parameter.\n', 400);
        }

        mongo.operations.query(collection, { key: key }, function(err, data) {
            if (err) {
                res.send(err, 500);
            } else if (!data || data.length === 0) {
                mongo.operations.insert(collection, { key: key, secret: secret }, function() {
                    res.send('Application key ' + key + 'successfully registered\n');
                });
            } else {
                if (data[0].secret != old) {
                    res.send('old_secret parameter doesn\'t match the one currently registered. \
If you\'re sure you provided the correct secret, your consumer secret may have \
been compromised and you should reset your keys.', 403);
                } else {
                    mongo.operations.updateById(collection, data[0]._id.toString(), { $set: { secret: secret } }, function() {
                        res.send('Consumer secret has been updated successfully.');
                    });
                }
            }
        })
    });
};