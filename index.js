'use strict';
console.log('Loading function');

var AWS = require('aws-sdk');
AWS.config.region = 'us-east-1';
var s3 = new AWS.S3();
var dynamodb = new AWS.DynamoDB();

const s3Bucket = "aplx.us";
const s3KeyPrefix = "";
const shortDomain = "http://aplx.us/";
const dynamoTable = "counters";
const appName = "url_shortner";


// Add HTTP if no prefix exists
function addhttp(url) {
    if (!/^(f|ht)tps?:\/\//i.test(url)) {
        url = "http://" + url;
    }
    return url;
}

function getShortFileName(counterValue) {
    //use a simple Base62 encode of the counter to create the short URL 
    var base62 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    var shortFileName = '';
    var base62Length = base62.length;

    //Map the integer to the equivelent of our Base62 values
    while (counterValue) {
        var leftOver = counterValue % base62Length;
        counterValue = Math.floor(counterValue / base62Length);
        shortFileName = base62[leftOver].toString() + shortFileName;
    }
    return shortFileName;
}

exports.handler = (event, context) => {

    var dynamoParams = {
        Key: {
            'application': {
                S: appName
            }
        },
        TableName: dynamoTable,
        UpdateExpression: 'SET counterValue = counterValue  + :increment',
        ExpressionAttributeValues: {
            ":increment": { N: "1" }
        },
        ReturnValues: "ALL_NEW"
    };

    //get next value from the DynamoDB counter
    dynamodb.updateItem(dynamoParams, function (err, data) {
        if (err) context.fail(err, err.stack);
        else {

            //A few things to note here:
            //  1. Body is empty since we don't need one.  Creates a zero-byte object in S3
            //  2. ACL is setup as 'public-read' so the people can get to the redirect object from anywhere
            //  3. ContentType of text/html isn't required but otherwise, it's autodetected as text/octet
            //  4. WebsiteRedirectLocation is the secret sauce for the whole thing....

            var s3Params = {
                Bucket: s3Bucket,
                Key: s3KeyPrefix + getShortFileName(data.Attributes.counterValue.N),
                ACL: 'public-read',
                Body: '',
                ContentType: 'text/html',
                WebsiteRedirectLocation: addhttp(event.url)
            };

            // put our zero-length object to our S3 bucket
            s3.putObject(s3Params, function (err, data) {
                if (err) context.fail(err, err.stack);
                else
                    context.succeed({ "shortUrl": shortDomain + s3Params.Key });
            });

        }

    });

};
