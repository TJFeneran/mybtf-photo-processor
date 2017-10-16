# mybtf-photo-processor

AWS Services used:
1] EC2 (T2.small w/ Amazon Linux AMI)\n
2] SQS Queue

Scripting Languages used:
1] Node.js

Use the bash user-data during or after instance launch to install dependencies and clone this repository to /home/ec2-user/node-photo-processor.
Current optimal configuration uses auto-scaling between 1-5 instances, polling SQS in parallel.

The loop can be started by 'node sqs.js' inside the cloned directory.

Script will poll SQS queue for any messages. If none, timeout 10 seconds and try again.  If message found, process, then immediately poll again.

Messages are added to the SQS queue automatically after any RAW photo uploaded to the mybtf_photovideo bucket. Valid messages are processed into two additional files: a thumbnail with no watermark, and a preview image with medium resolution and watermark. Invalid messages are deleted. 

TJ@breakthefloor.com
