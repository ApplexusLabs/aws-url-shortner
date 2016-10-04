# Serverless URL Shortner using S3, Lambda, DynamoDB and API Gateway

## Summary
There are many URL shortners out there implemented in PHP, Node, Ruby, etc.  Dave Konopka has also created a really neat verion using the AWS components of Lambda, Dynamo and the API gateway with a ridiculously cheap operating cost...about $5.12 per month to support 1 million hits. (http://www.davekonopka.com/2016/serverless-aws-lambda-api-gateway.html)
 
I wanted to see if I could go a slightly differnt route--partly as a traning excercise, partly to see if I could come up with a less costly way but mostly because I like finding new ways to leverage AWS functionality--aka "hack the system".

## Design
In Dave's example, he uses API Gateway to front-end both the POST (convert a normal URL to shortened URL) and GET (translate the short URL into the original URL), returning a nifty redirect HTTP code to the client.

The only problem I see is what if a few tiny URL's go absolutely viral?!  All of the services used for the GET would be hit and costs would go up...  We'd be talking what....$6 or even $7 dollars now?  Wow, maybe some of you can simply absorb those extra $2 dollars but not me....No Sir!

Instead, I wanted to offload the GET portion from API Gateway, Lambda and Dynamo and use S3.  Originally, I had the idea of generating an HTML file for each POST that used META REFRESH or some Javascript.  Then I figured out that we can tell S3 to redirect right in the object metadata itself.

So, we'd be able to create a zero-byte file that contained the Website Redirect metadata to forward the client using the short URL to the original URL.  As a result, 1 million GET's from S3 is about $0.40.  We'd still do the POSTs via API Gateway and Lambda then use DynamoDB to keep a counter to encode as the short URL (actually the zero-byte object on S3).  We also want to purge out old URL's when they get past a certain age.

## Componets
1. Setup S3 bucket
2. Setup a DynamoDB table to keep an atomic counter
3. Create basic IAM role for our Lambda routine
4. Create Lambda function to create the shortened key and save an object to S3
5. Create API Gateway to front the Lambda routine for the POST
6. Assign custom URL to S3 path
7. Use the S3 Lifecycle config to purge out links past a certain age
8. Profit!

### Step 1 - Setup S3 Bucket

Setting up the S3 bucket is easy enough.  Just create one and be sure to set it for Static Web Hosting.  You have to configure an index document, so just use index.html.

![image of s3](/img/s3-1.png)

### Step 2 - Create DynamoDB table to keep up with a counter

To generate the shortened URL, we want to use a simple one-up counter to serve as the source, and encode that to yeild the URL.  There are a few different ways of doing this, but for our purposes, we're just going to create a generic Counter table and give it two name/value pairs per record.

![image of dynamo1](/img/dynamodb-1.png)

![image of dynamo2](/img/dynamodb-2.png)


### Step 3 - Create basic IAM role for our Lambda routine

Keeping it simple for our purposes here.  Only granting access to the S3 bucket and DynamoDB table we need.

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "dynamodb:UpdateItem",
                "logs:CreateLogGroup",
                "logs:CreateLogStream",
                "logs:PutLogEvents"
            ],
            "Resource": "arn:aws:dynamodb:us-east-1:xxxxxxxxxxxx:table/counters"
        },
        {
            "Effect": "Allow",
            "Action": [
                "s3:PutObject",
                "s3:PutObjectAcl"
            ],
            "Resource": [
                "arn:aws:s3:::aplx.us/*"
            ]
        }
    ]
}
```

### Step 3 - Create Lambda function to to the work

Here's the rough pseudocode we'll need:

1. Check the inbound original URL for an HTTP prefix and add it if not passed in
2. Get the next number in the DynamoDb counter
3. Encode that number into a shortened string
4. Write a zero-length file out to our S3 bucket with the appropriate metadata
5. Return the shortened URL

Here's [the code](index.js).

### Step 4 - Create API Gateway for POST to the Lambda function

The API Gateway is very simple and only consists of a POST at the root.  We assign the Lambda Function in the Integration Request and that's it.  We POST in a JSON string containing the original URL and get back a JSON string with the short URL.

![apigate1](/img/apigate-1.png)

![apigate2](/img/apigate-2.png)

```json
{
  "swagger": "2.0",
  "info": {
    "version": "2016-06-13T23:58:18Z",
    "title": "pletcherUrlShortner"
  },
  "host": "xxxxxxx.execute-api.us-east-1.amazonaws.com",
  "basePath": "/dev",
  "schemes": [
    "https"
  ],
  "paths": {
    "/": {
      "post": {
        "produces": [
          "application/json"
        ],
        "responses": {
          "200": {
            "description": "200 response",
            "schema": {
              "$ref": "#/definitions/Empty"
            }
          }
        }
      }
    }
  },
  "definitions": {
    "Empty": {
      "type": "object"
    }
  }
```

### Step 5 - Assign custom domain name to S3 bucket using Route 53

I wanted to assign Applexus' custom short domain to the S3 bucket at the apex domain level, meaning I didn't want to have anything before the domain.   Now, here's the trick.  Route 53 only supports assigning anything to the apex domain if you use an Alias.  So, we create an IP record (Type A), choose Alias and select our S3 bucket that's setup for web hosting.

Then, we can access it like '''http://aplx.us/StNm'''.

NOTE: One problem I ran into was my S3 bucket wasn't showing up initially on the list of Aliases.  Several other people have also had this problem and seemed to resolve it by naming their S3 bucket with the same name as their desired domain.  I recreated my bucket using "aplx.us" as the name and it showed up for me to select.

![image route53.png](/img/route53.png)

### Step 6 - Setup Lifecycle management for old links 

On the S3 Bucket, go into the Lifecycle area on Properties.  Setup a policy to purge file after some period of time.

![image s3-2](/img/s3-2.png)

### Step 7 - Profit!

Here's how much this bad boy will cost us to operate:
![image s3-costs](/img/s3-costs.png)

As expected, the real cost driver here is the POST or "create new short URL" part of the process.  If we assume that the majority of requests will be to serve up clicks of the short URL and the create process only comprises a small portion, the costs look very different than if we assume 1M of both creates and reads.  From a "going viral" standpoint, you can see that the cost scaling of the GETs is significantly less than the POST component.

Did we meet our goal of a more cost-effective URL shortner than using purely Lambda, Dynamo and API Gateway?  Well, that depends on the POST profile you expect as there is a trade-off point.

### Next Steps

I bet there's an even more effiecnt and way to accomplish this.  Please feel free to take up the challenge!
