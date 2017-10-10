const AWS = require('aws-sdk');
	  AWS.config.update({region: 'us-east-1'});
const gm = require('gm')
		  .subClass({ imageMagick: true });

const s3 =  new AWS.S3();
const sqs = new AWS.SQS();

const util = require('utils');
const queueURL = "https://sqs.us-east-1.amazonaws.com/112544162749/MyBTF-Photo-Process";

var typeMatch = "";
var imageType = "";

function processImage(s3bucket,s3key,callback) {

	if(s3key.length > 10 && s3bucket.length > 1) {
		
		typeMatch = s3key.match(/\.([^.]*)$/);
		imageType = typeMatch[1];
		
		getS3Image(s3bucket, s3key, function(s3Image) {
			
			if(s3Image.Body) {	
				
				var isradix = s3key.indexOf('radix/') > -1 ? true : false;
				
				transformImage(s3Image.Body, 'preview', isradix, function(result1) {
					if(result1) {
						transformImage(s3Image.Body, 'thumbs', isradix, function(result2) {
							if(result2) {
								callback(true);
							} else callback(false);
						});
					}
				});
				
			} else callback(false);
			
		});
		
	}
}

function getS3Image(s3bucket, s3key, callback) {

	if(s3key.length > 10 && s3bucket.length > 1) {
		var params = {
			ACL: 'public-read',
			Bucket: s3bucket, 
			Key: s3key
		};
		s3.putObjectAcl(params, function(err, data) {
			if (err) {
				//console.log(err, err.stack);
				console.log("COULD NOT GET S3 FILE");
				callback(false);
			}
			else {
				s3.getObject({
		            Bucket: s3bucket,
		            Key: s3key
		       }, function(err, data) {
		       	
		       		if (err) {
		       			//	console.log(err, err.stack);
		       			console.log("COULD NOT GET S3 FILE");
		       			callback(false);
		       		}
					else {
		       			callback(data);
		       		}
		       });
			}
		});
	}
}

function transformImage(rawimage, thumbtype, isradix, callback) {	
		
	gm(rawimage).size(function(err, size) {
		
		if(thumbtype == "preview") {
			width = 450;
			height = size.width >= size.height ? 300 : 674;
			
			var watermark = isradix ? "/home/ec2-user/node-photo-processor/radix-watermark.png" : "/home/ec2-user/node-photo-processor/mybtf-watermark.png";
			
			this.gravity('center')
	    		.resizeExact(width, height)
	    		.draw(['gravity NorthWest image Plus 0,0 0,0 "'+watermark+'"'])
	    		.quality(65)
			    .toBuffer('JPG', function(err, buffer) {
			    	var dstKey = s3key.replace('/raw/','/'+thumbtype+'/').replace('.JPG','.jpg');
					uploadImage(buffer,s3bucket,dstKey, function(uploaded){
						if(uploaded) {
							callback(true);
						} else callback(false);
					});
				});

		} else {
			width = 100;
			height = 67;
			
			this.gravity('center')
	    		.resizeExact(width, height)
	    		.quality(45)
			    .toBuffer('JPG', function(err, buffer) {
			    	var dstKey = s3key.replace('/raw/','/'+thumbtype+'/').replace('.JPG','.jpg');
					uploadImage(buffer,s3bucket,dstKey, function(uploaded){
						if(uploaded) {
							callback(true);
						} else callback(false);
					});
				});	
		} 
		
	});

}

function uploadImage(buffer,s3bucket,dstKey,callback) {
	s3.putObject({
        Bucket: s3bucket,
        Key: dstKey,
        Body: buffer,
        ContentType: imageType,
        StorageClass: 'REDUCED_REDUNDANCY',
        ACL: 'public-read'
    } , function(err, data) {
    	
    	if (err) {
    		console.log(err, err.stack);
    		callback(false);
    	}
    	else {
    		console.log("uploaded: "+s3bucket+'/'+dstKey);
    		callback(true);
    	}
    	
    });
}

function deleteSQSMessage(receipthandle, callback) {
	var deleteParams = {
		QueueUrl: queueURL,
		ReceiptHandle: receipthandle
	};
	sqs.deleteMessage(deleteParams, function(err, data) {
		if (err) {
			callback(false);
			console.log("Delete Error", err);
		} else {
			callback(true);
			console.log("Message Deleted", data);
		}
	});
}

function getSQSMessage(callback) {

	var params = {
		QueueUrl: queueURL,
		AttributeNames: [
			'All'
		],
		MessageAttributeNames: [
			'All'
		],
		MaxNumberOfMessages: 1,
		VisibilityTimeout: 60,
		WaitTimeSeconds: 0
	};

	sqs.receiveMessage(params, function(err, data) {
			
		if (err) console.log(err, err.stack);
		else {

			if(data.Messages !== undefined) {
				
				receipthandle = data.Messages[0].ReceiptHandle;
				var messagebody = JSON.parse(data.Messages[0].Body);

				if(messagebody['Records']) {
					s3bucket = messagebody['Records'][0]['s3']['bucket']['name'];
					s3key = messagebody['Records'][0]['s3']['object']['key'];
					
					//var tmpkeys = s3key.split("/");
					//var filename = tmpkeys[tmpkeys.length-1];
					//var newfilename = filename.replace(/\+/g,'\ ');
					
					//s3key = s3key.replace(filename,newfilename);
					
					if(s3key.indexOf('/raw/') > -1) {
						
						processImage(s3bucket,s3key, function(response) {
							if(response) {
								deleteSQSMessage(receipthandle,function(deleted) {
									callback("DONE");
								});
							} else {
								callback("ERROR");
							}
						});
					}	
					else {
						deleteSQSMessage(receipthandle, function(response) {
							console.log("** Not a /raw/ image");
							callback("DONE");
						});
								
					}
				} else {
					deleteSQSMessage(receipthandle, function(response) {
						console.log("** INVALID / TEST MESSAGE");
						callback("DONE");
					});
				}

			} else {
				callback("NO MESSAGES");
			}
		}
	});
}	
	

function parseGoResponse(response) {
	
	if(response == "DONE") {
		console.log("Finished processing a message.");
		go();
	}
	if(response == "ERROR") {
		console.log("General Error");
		go();
	}
	if(response == "NO MESSAGES") {
		console.log("NO SQS MESSAGES");
		setTimeout( function() { go(); } , 10000);
	}
}


function go() {
	getSQSMessage(function(response) {
		parseGoResponse(response);	
	});
}

// START THE LOOP
go();
