var Botkit = require('botkit');
var request = require("request");
var geolib = require("geolib");
var _ = require("underscore");
var geocoder = require('geocoder');
var async = require('async');
var distance = require('google-distance');

var PORT = process.env.PORT || 8080

var controller = Botkit.slackbot({
    debug: false
    //include "log: false" to disable logging
    //or a "logLevel" integer from 0 to 7 to adjust logging verbosity
});

controller.setupWebserver(PORT, function (err, webserver) {
    if (err) {
        console.error(err);
        process.exit(1);
    }

    // Setup our slash command webhook endpoints
    controller.createWebhookEndpoints(webserver);
});


// connect the bot to a stream of messages
controller.spawn({
    token: process.env.SLACK_TOKEN,
}).startRTM();


// reply to a direct mention - @bot hello
controller.on(['direct_mention', 'direct_message'], function (bot, message) {

    //To wit.ai
    sendToWit(message.text,
        //Wit response
        (function (intent, result) {

            async.parallel([
                    function (callback) {
                        geocoder.geocode(result.entities.origin[0].value, callback);
                    },
                    function (callback) {
                        geocoder.geocode(result.entities.destination[0].value, callback);
                    }
                ],
                function (err, results) {

                    var source = results[0].results[0].geometry.location;
                    var destination = results[1].results[0].geometry.location;

                    getBixiStations((function (stations) {

                        stations = JSON.parse(stations).stations;
                        var subarray = _.map(stations, function (obj) {
                            var reducedArray = _.pick(obj, 'id', 'la', 'lo');
                            reducedArray.latitude = reducedArray.la;
                            delete reducedArray.la;
                            reducedArray.longitude = reducedArray.lo;
                            delete reducedArray.lo;
                            return reducedArray;
                        });

                        var nearestSource = geolib.findNearest({
                            latitude: source.lat,
                            longitude: source.lng
                        }, subarray, 0);

                        var nearestDestination = geolib.findNearest({
                            latitude: destination.lat,
                            longitude: destination.lng
                        }, subarray, 0);


                        var stationSource = _.chain(stations).where({id: nearestSource.id})._wrapped[0],
                            stationDestination = _.chain(stations).where({id: nearestDestination.id})._wrapped[0];

                        distance.get(
                            {
                                origin: stationSource.la + ',' + stationSource.lo,
                                destination: stationDestination.la + ',' + stationDestination.lo,
                                mode: 'bicycling',
                                units: 'metric'
                            }, function (err, data) {
                                if (err) return console.log(err);
                                console.log(data);

                                var reply_with_attachments = {
                                    // 'text': 'Here\'s your travel',
                                    'attachments': [
                                        {
                                            'title': ':link: My ride ',
                                            'title_link': 'https://www.google.ca/maps/dir/' +
                                            stationSource.la + ',' + stationSource.lo + '/' +
                                            stationDestination.la + ',' + stationDestination.lo+'/'+
                                               '@' + (stationSource.la + stationDestination.la)/2+ ','+(stationSource.lo + stationDestination.lo)/2 +
                                            '/data=!4m2!4m1!3e1',
                                            'fallback': 'To be useful, I need you to invite me in a channel.',
                                            "fields": [
                                                {
                                                    "title": "From",
                                                    "value": ':round_pushpin: ' + stationSource.s,
                                                    "short": true
                                                },
                                                {
                                                    "title": "To",
                                                    "value": ":triangular_flag_on_post: " + stationDestination.s,
                                                    "short": true
                                                }
                                            ],
                                            'text': 'Distance and time\n    :bike: : ' + data.distance + '\n    :stopwatch: : ' + data.duration,
                                            "image_url": getMapUrl(
                                                stationSource.la + "," + stationSource.lo,
                                                stationDestination.la + "," + stationDestination.lo),
                                            'color': '#7CD197'
                                        }
                                    ]

                                };


                                bot.reply(message, reply_with_attachments);
                            });


                        // getMapUrl(stationSource.la+","+stationSource.lo,stationDestination.la+","+stationDestination.lo)
                        // bot.reply(message, 'CALLBACK :\n' + intent + '\n' + JSON.stringify(_.chain(stations).where({id: nearestSource.id})));

                    }));

                });
        }));
});

function getMapUrl(source, destination) {
    return "http://maps.googleapis.com/maps/api/staticmap?" +
        "autoscale=1&" +
        "size=500x300&" +
        "maptype=terrain&" +
        "key=" + process.env.GOOGLE_MAP_TOKEN + "&" +
        "format=png&" +
        "visual_refresh=true&" +
        "markers=icon:http://www.emoji-cheat-sheet.com/graphics/emojis/triangular_flag_on_post.png%7Cshadow:true%7C" + destination + "&" +
        "markers=icon:http://www.emoji-cheat-sheet.com/graphics/emojis/round_pushpin.png%7Cshadow:true%7C" + source;

}

function getBixiStations(callback) {

    var options = {
        method: 'GET',
        url: 'https://secure.bixi.com/data/stations.json',
        headers: {
            'content-type': 'application/json',
            accept: 'application/vnd.wit.20141022+json'
        }
    };

    request(options, function (error, response, body) {
        if (error) throw new Error(error);
        callback(body);
    });

}

function sendToWit(query, callback) {
    var options = {
        method: 'GET',
        url: 'https://api.wit.ai/message',
        qs: {q: query},
        headers: {
            "content-type": 'application/json',
            accept: 'application/vnd.wit.20160330+json',
            authorization: 'Bearer ' + process.env.WIT_TOKEN
        }
    };

    request(options, function (error, response, body) {
        if (error) throw new Error(error);

        var json, ref, intent, i, len, results;
        json = JSON.parse(body);
        if (json.outcomes.length > 0) {
            ref = json.outcomes;
            results = [];
            for (i = 0, len = ref.length; i < len; i++) {
                intent = ref[i];
                results.push((function (intent) {
                    callback("" + intent.intent, {
                        res: query,
                        entities: intent.entities
                    });
                })(intent));
            }
        }
    });

}


