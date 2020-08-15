const { Client, MessageEmbed } = require('discord.js');
const axios = require('axios');
const fs = require('fs');
const cld = require('cld');
const aws = require('aws-sdk');

const DEFAULT_LANG = 'EN';
const AUTH_FILE = './auth.json';

const awsLanguageCode = [ //todo
  'arb',
  'cmn-CN',
  'cy-GB',
  'da-DK',
  'de-DE',
  'en-AU',
  'en-GB',
  'en-GB-WLS',
  'en-IN',
  'en-US',
  'es-ES',
  'es-MX',
  'es-US',
  'fr-CA',
  'fr-FR',
  'is-IS',
  'it-IT',
  'ja-JP',
  'hi-IN',
  'ko-KR',
  'nb-NO',
  'nl-NL',
  'pl-PL',
  'pt-BR',
  'pt-PT',
  'ro-RO',
  'ru-RU',
  'sv-SE',
  'tr-TR',
];

let token = '';
let prefix = '!tts';

const streamMapping = new Map();
const client = new Client();

client.once('ready', () => {
	console.log('Ready!');
});

client.once('reconnecting', () => {
	console.log('Reconnecting!');
});
client.once('disconnect', () => {
	console.log('Disconnect!');
});

client.on('message', async message => {

  if (message.author.bot) return;
  if (!message.channel.topic) return;
  const translationConfig = message.channel.topic.trim().match('text-to-speech');
  if (!translationConfig) return;

  // print help
  if (message.content.startsWith(`${prefix} help`)) {
      message.channel.send(
        '!tts connect - connect vc/vcにbotが参加します\n' +
        '!tts disconnect - disconnect vc/vcからbot退出します\n' +
        '!tts help - you know what it is\n'
      );
      return;
  }

  if (!message.guild) return;
  if (!message.member.voice.channel) return;
  const channelName = message.member.voice.channel.name;

  if (message.content.startsWith(`${prefix} connect`)) {
    const vc = await message.member.voice.channel.join();
    if (!vc) {
      message.reply('Could not join the channel/vc に参加できませんでした');
      return;
    }
    message.reply(`Joinned ${channelName}/ ${channelName} に接続しました`);
    streamMapping.set(channelName, { vc, datetime: Date.now(), });
    return;
  } else if (message.content.startsWith(`${prefix} disconnect`)) {
    const streaming = streamMapping.get(channelName);
    if (!streaming) {
      message.reply('bot is not in your vc/botはvcに参加していません');
      return;
    }
    const vc = streaming.vc;
    await vc.disconnect();
    streamMapping.delete(channelName);
    return;
  }

  const streaming = streamMapping.get(channelName); 
  if (!streaming) return; // not connected.

  let langCode;
  let voiceId;
  try {
    const detectedLangs = await cld.detect(message.content)
    langCode = detectedLangs.languages[0].code;
  } catch (error) {
    message.reply('Failed to detect language/言語の検知に失敗しました');
    console.log(error);
    return;
  }

  if (langCode === 'en') {
    langCode = 'en-GB';   // you know why.
  } else {
    langCode = awsLanguageCode.find(l => l.startsWith(langCode));
    if (!langCode) {
      message.reply('Failed to find language code/言語コードの検知に失敗しました');
      return;
    }
  }
  
  const voiceParam = {
    LanguageCode: langCode,
  };
  Polly.describeVoices(voiceParam, (err, data) => {
    if (err) {
      console.log(err);
    } else if (data) {
      voiceId = data.Voices.find(v => v.Gender === 'Female').Id;
      const param = {
        'Text': message.content,
        'OutputFormat': 'mp3',
        'VoiceId': voiceId,
        'LanguageCode': langCode,
      }
      getAndPlayTTS(param, message, streaming);
    }
  })

});

const getAndPlayTTS = (param, message, streaming) => {
  Polly.synthesizeSpeech(param, (err, data) => {
    if (err) {
      message.reply('Failed to call aws polly/aws polly の呼び出しに失敗しました');
      return;
    } else if (data) {
      if (data.AudioStream instanceof Buffer) {
        const filename = './ttsdata/' + message.author.id + '.mp3';
        fs.writeFileSync(filename, data.AudioStream)
        const dispatcher = streaming.vc.play(filename, {
          volume: 0.2,
        })
        .on('finish', () => {
          console.log('play done');
          fs.unlink(filename, () => { });
          dispatcher.destroy();
          streaming.timestamp = Date.now();
        })
      }
    }
  })
}

// disconnect after 10 mins without time

if (fs.existsSync(AUTH_FILE)) {
  console.log('auth: using auth file.');
  var auth = require(AUTH_FILE);
  token = auth.token;
  auth_key = auth.auth_key;
  prefix = auth.prefix;
  access_key_id = auth.access_key_id;
  secret_access_key = auth.secret_access_key;
} else {
  console.log('auth: not found.');
  process.exit(1);
}

if (process.env.KEEP_ALIVE_ENDPOINT) {
  require('../heartbeat');
}

const Polly = new aws.Polly({
  signatureVersion: 'v4',
  region: 'us-east-1',
  credentials: {
    accessKeyId: access_key_id,
    secretAccessKey: secret_access_key,
  }
});

client.login(token);