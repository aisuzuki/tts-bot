const { Client, MessageEmbed, ReactionUserManager } = require('discord.js');
const axios = require('axios');
const fs = require('fs');
const aws = require('aws-sdk');
const {
  ComprehendClient 
} = require('@aws-sdk/client-comprehend-node/ComprehendClient');
const {
  BatchDetectDominantLanguageCommand 
} = require('@aws-sdk/client-comprehend-node/commands/BatchDetectDominantLanguageCommand');

const DEFAULT_LANG = 'EN';
const CONFIG = require('./auth.json');
const POLLY_VALUES = require('./polly.json');

if (!fs.existsSync('./userconf.json')) {
  fs.writeFileSync('./userconf.json', JSON.stringify({}));
}
const USERCONF = require('./userconf.json');

let prefix = CONFIG.prefix;

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

client.on('voiceStateUpdate', async (oldState, newState) => {
  if (oldState.channel === null) return;
  if (oldState.channel.members.size === 1 && oldState.channel.members.find(m => m.displayName === 'i18n-text-to-speech') !== null) {
    const channelName = oldState.channel.name;
    const streaming = streamMapping.get(channelName);
    if (!streaming) {
      return;
    }
    const vc = streaming.vc;
    await vc.disconnect();
    streamMapping.delete(channelName);
  }
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
      '!tts voice {language(e.g, en)/言語} {language code/言語コード} {voice id/言語ID} - change language accent/言語別の発音を設定します\n' +
      '!tts la list - display language code list/言語コードのリストを表示します\n' +
      '!tts vid list - display voice id list/音声IDの一覧を表示します\n' +
      '!tts help - you know what it is\n'
    );
    return;
  }

  if (message.content === '') return;
  if (message.content.startsWith('http')) return;
  if (!message.guild) return;
  if (!message.member.voice.channel) return;
  /*
if (!message.member.voice.channel) {
  message.reply('Join voice channel first/最初に Voice channel 参加してください');
  return;
}
*/
  const channelName = message.member.voice.channel.name;

  if (message.content.startsWith(`${prefix} connect`)) {
    if (streamMapping.get(channelName)) {
      // TODO
    }
    const vc = await message.member.voice.channel.join();
    if (!vc) {
      message.reply('Could not join the channel/vc に参加できませんでした');
      return;
    }
    message.reply(`Joinned ${channelName}/ ${channelName} に接続しました`);
    streamMapping.set(channelName,
      {
        vc,
        playing: false,
        queue: [],
        datetime: Date.now()
      }
    );

    if (!USERCONF[message.author.username]) {
      // todo
      USERCONF[message.author.username] = {
      };
      try {
        fs.writeFileSync('./userconf.json', JSON.stringify(USERCONF));
      } catch (err) {
        console.log('could not save user conf: ' + err);
      }
    }

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
  } else if (message.content.startsWith(`${prefix} voice `)) {

      const values = message.content.slice(`${prefix} voice `.length).split(' ');
      if (values.length !== 3) {
        message.reply(
          'please define language, language code and voice id/言語、言語コード、音声IDを正しく設定してください \n' +
          'Example: \n' +
          prefix + ' voice en en-GB Amy \n\n' +
          '例: \n' +
          prefix + ' voice ja ja-JP Mizuki'
        );
        return;
      }
      const lang = values[0].trim();
      if (!POLLY_VALUES.languageCode.find(l => l.startsWith(lang))) {
        message.reply('invalid language/言語が正しくありません: ' + lang);
        return;
      }
      const langCode = values[1].trim();
      if (!POLLY_VALUES.languageCode.find(l => l === langCode)) {
        message.reply('invalid language code/言語コードが正しくありません: ' + langCode + ' \n' +
                      'language code/言語コード: \n' +
                      POLLY_VALUES.languageCode.join('\n')
        );
        return;
      }
      const voiceId = values[2].trim();
      const voiceParam = {
        LanguageCode: langCode,
      };
      Polly.describeVoices(voiceParam, (err, data) => {
        if (!data.Voices.find(v => v.Id === voiceId)) {
          message.reply(
            'defined voice id is not able to speak ' + langCode + '/指定された音声IDは' + langCode + 'に対応していません \n' +
            'voice id for ' + langCode + '/' + langCode + 'に対応する音声: \n' +
            data.Voices.map(v => v.Id).join('\n')
          );
        }
        // todo
        if (!USERCONF[message.author.username]) {
          USERCONF[message.author.username] = {};
        }
        USERCONF[message.author.username][lang] = {
          languageCode: langCode,
          voiceId: voiceId,
        }
        try {
          fs.writeFileSync('./userconf.json', JSON.stringify(USERCONF));
        } catch (err) {
          console.log('could not save user conf: ' + err);
        }
      });
      return;
  } else if (message.content.startsWith(`${prefix} vid list`)) {
    message.reply('JA: https://aws.amazon.com/jp/polly/features/#Wide_Selection_of_Voices_and_Languages');
    message.reply('EN: https://aws.amazon.com/polly/features/#Wide_Selection_of_Voices_and_Languages');
    return;
  } else if (message.content.startsWith(`${prefix} la list`)) {
    message.reply('JA: https://docs.aws.amazon.com/ja_jp/polly/latest/dg/SupportedLanguage.html');
    message.reply('EN: https://docs.aws.amazon.com/polly/latest/dg/SupportedLanguage.html');
    return;
  }

  const streaming = streamMapping.get(channelName);
  if (!streaming) return; // not connected.

  let text = message.content;
  if (isKusa(text)) {
    text = text.replace('w+', 'くさ').replace('ｗ+', 'くさ');
  }
  text = text.replace(/<@!.+?>/, ''); // remove user name
  if (text === '') {
    return;   // TODO
  }
  text = text.replace(/<:.+?>/, ''); // remove custom emoji
  if (text === '') {
    return;   // TODO
  }

  let languageCode;
  let audioConf;
  try {
    const params = {
      TextList: [
        text,
      ]
    };
    const batchDetectDominantLanguageCommand = new BatchDetectDominantLanguageCommand(
      params
    );

    const data = await comprehend.send(batchDetectDominantLanguageCommand);
    // use the highest possible language.
    let langCode = data.ResultList[0].Languages[0].LanguageCode;
    console.log(langCode + ': ' + JSON.stringify(data));
    if (langCode === 'no') {
        langCode = 'nb';
    }

    if (USERCONF[message.author.username]) {
      audioConf = USERCONF[message.author.username][langCode];
    }
	 
    if (audioConf) {
      console.log("Polly use audio conf: " + audioConf.languageCode);
      languageCode = audioConf.languageCode;
    } else if (langCode === 'en') {
      console.log("Polly default en-GB");
      languageCode = 'en-GB';   // you know why.
    } else {
      languageCode = POLLY_VALUES.languageCode.find(l => l.startsWith(langCode));
      console.log("Polly language code: " + languageCode + ", langCode: " + langCode);
      if (!languageCode) {
        message.reply('Failed to detect language/言語の検知に失敗しました [' + langCode + '] - using default : ja-JP');
        languageCode = 'ja-JP'
      }
    }
    console.log("Polly final language code: " + languageCode);

  } catch (error) {
    console.log('request error: ' + error);
//    const metadata = error.$metadata;
//    console.log(`requestId: ${metadata.requestId} cfId: ${metadata.cfId} extendedRequestId: ${metadata.extendedRequestId}`);
    /*
  The keys within exceptions are also parsed. You can access them by specifying exception names:
      if(error.name === 'SomeServiceException') {
          const value = error.specialKeyInException;
      }
  */
  }

  const voiceParam = {
    LanguageCode: languageCode,
  };
  Polly.describeVoices(voiceParam, (err, data) => {
    if (err) {
      console.log(err);
    } else if (data) {
      let voice;
      if (audioConf) {
        voice = data.Voices.find(vid => vid.Id === audioConf.voiceId);
      }
      if (!voice) {
        voice = data.Voices.find(v => v.Gender === 'Female');    // female by default
      }
      const param = {
        'Text': text,
        'OutputFormat': 'mp3',
        'VoiceId': voice.Id,
        'LanguageCode': languageCode,
        'Engine': voice.SupportedEngines.find(e => e === "neural") ? "neural" : "standard"
      }
      getAndPlayTTS(param, message, streaming);
    }
  })

});


function isKusa(text) {
  return text.match('w+') || text.match('ｗ+');
}

const getAndPlayTTS = (param, message, streaming) => {
  Polly.synthesizeSpeech(param, (err, data) => {
    if (err) {
      message.reply('Failed to call aws polly/aws polly の呼び出しに失敗しました');
      console.log("failed to call polly reason: " + err)
      return;
    } else if (data) {
      if (data.AudioStream instanceof Buffer) {
        const filename = './ttsdata/' + message.author.id + '.mp3';
        fs.writeFileSync(filename, data.AudioStream)

        // qeuing
        streaming.queue.push(filename);
        if (!streaming.playing) {
          streaming.playing = true;
          play(streaming.queue[0], streaming)
        }
      }
    }
  })
}

const play = (filename, streaming) => {
  if (!filename) {
    streaming.playing = false;
    return;
  }
  const dispatcher = streaming.vc.play(filename, {
    volume: 0.6,
  })
  .on('finish', () => {
    console.log('play done');
    fs.unlink(filename, () => { });
    dispatcher.destroy();
    streaming.timestamp = Date.now();

    streaming.queue.shift();
    play(streaming.queue[0], streaming);
  });
}

// disconnect after 10 mins without time

if (process.env.KEEP_ALIVE_ENDPOINT) {
  require('../heartbeat');
}

const Polly = new aws.Polly({
  signatureVersion: 'v4',
  region: 'eu-central-1',
  credentials: {
    accessKeyId: CONFIG.access_key_id,
    secretAccessKey: CONFIG.secret_access_key,
  }
});
const comprehend = new ComprehendClient({
  signatureVersion: 'v4',
  region: 'eu-central-1',
  credentials: {
    accessKeyId: CONFIG.access_key_id,
    secretAccessKey: CONFIG.secret_access_key,
  }
});

client.login(CONFIG.token);
