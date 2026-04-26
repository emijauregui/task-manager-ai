require('dotenv').config();
const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');

// Use inference profile for Claude Sonnet 4.5
const MODEL_ID = 'us.anthropic.claude-sonnet-4-5-20250929-v1:0';

async function testBedrock() {
  console.log('🧪 Testing AWS Bedrock Connection...\n');

  // Check credentials
  console.log('📋 Configuration:');
  console.log(`   Region: ${process.env.AWS_REGION || 'us-east-2'}`);
  console.log(`   Access Key: ${process.env.AWS_ACCESS_KEY_ID ? process.env.AWS_ACCESS_KEY_ID.substring(0, 10) + '...' : 'NOT SET'}`);
  console.log(`   Secret Key: ${process.env.AWS_SECRET_ACCESS_KEY ? '***' + process.env.AWS_SECRET_ACCESS_KEY.slice(-4) : 'NOT SET'}`);
  console.log(`   Model ID: ${MODEL_ID}\n`);

  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    console.error('❌ AWS credentials not configured in .env file');
    process.exit(1);
  }

  // Initialize client
  const client = new BedrockRuntimeClient({
    region: process.env.AWS_REGION || 'us-east-2',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });

  console.log('✅ Bedrock client initialized\n');

  // Test payload
  const payload = {
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: [{
        type: 'text',
        text: 'Analiza esta tarea y sugiere un nivel de prioridad (high, medium, o low).\n\nTítulo: Comprar leche\nDescripción: Ir al supermercado\n\nResponde SOLO con un objeto JSON: {"priority": "low", "reasoning": "..."}'
      }]
    }]
  };

  console.log('📤 Sending request to Bedrock...');
  console.log('Payload:', JSON.stringify(payload, null, 2), '\n');

  try {
    const command = new InvokeModelCommand({
      modelId: MODEL_ID,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(payload),
    });

    const response = await client.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));

    console.log('✅ Response received!');
    console.log('📥 Full response:', JSON.stringify(responseBody, null, 2), '\n');

    if (responseBody.content && responseBody.content[0] && responseBody.content[0].text) {
      const text = responseBody.content[0].text;
      console.log('📝 Extracted text:', text, '\n');

      // Try to parse JSON
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        console.log('✅ JSON parsed successfully:');
        console.log('   Priority:', parsed.priority);
        console.log('   Reasoning:', parsed.reasoning);
      }
    }

    console.log('\n🎉 Test completed successfully!');
    console.log('✅ Bedrock is working correctly with your credentials');
  } catch (error) {
    console.error('\n❌ Error invoking Bedrock:');
    console.error('   Message:', error.message);
    console.error('   Code:', error.code || error.name);

    if (error.$metadata) {
      console.error('   HTTP Status:', error.$metadata.httpStatusCode);
      console.error('   Request ID:', error.$metadata.requestId);
    }

    console.error('\n🔍 Common issues:');
    console.error('   1. Invalid credentials → Check AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY');
    console.error('   2. Model not enabled → Enable model in Bedrock console for your region');
    console.error('   3. Wrong region → Verify AWS_REGION matches where Bedrock is enabled');
    console.error('   4. Missing permissions → User needs InvokeModel permission for Bedrock');

    process.exit(1);
  }
}

testBedrock();
