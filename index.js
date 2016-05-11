var Botkit = require('botkit');
var request = require("request");

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
        (function (intent, res) {
            bot.reply(message, 'CALLBACK :\n' + intent + '\n' + JSON.stringify(res));
        }));


});

function sendToWit(query, callback) {
    var options = {
        method: 'GET',
        url: 'https://api.wit.ai/message',
        qs: {q: query},
        headers: {
            "content-type": 'application/json',
            accept: 'application/vnd.wit.20141022+json',
            authorization: 'Bearer '+process.env.WIT_TOKEN
        }
    };

    request(options, function (error, response, body) {
        if (error) throw new Error(error);

        var json, ref, intent, i, len, results;
        json = JSON.parse(body);
        console.log("wit response: " + body);
        if (json.outcomes.length > 0) {
            ref = json.outcomes;
            results = [];
            for (i = 0, len = ref.length; i < len; i++) {
                intent = ref[i];
                results.push((function (intent) {
                    callback("" + intent.intent, {
                        // res: query,
                        entities: intent.entities
                    });
                })(intent));
            }
            // return results;
        }


        // callback(body);
    });

}
