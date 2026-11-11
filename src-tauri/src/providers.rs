use crate::store::{now,text,uid,write_atomic,Result,Store};
use serde_json::{json,Value};
use std::{sync::{Arc,Mutex},time::Duration};

pub fn presets()->Value{serde_json::from_str(include_str!("../../lib/provider-presets.json")).expect("provider presets")}
fn urlencoding_token(value:&str)->String{reqwest::Url::parse_with_params("https://placeholder.invalid",&[("token",value)]).unwrap().query().unwrap().trim_start_matches("token=").into()}
pub fn video_catalog()->Value{serde_json::from_str(include_str!("../../lib/higgsfield-catalog.json")).expect("Higgsfield catalog")}
pub fn is_api(value:&str)->bool{value.starts_with("api:")}
pub fn checked_url(value:&str)->Result<String>{
 let url=reqwest::Url::parse(value).map_err(|_|"Enter a valid API base URL.")?;
 let host=url.host_str().unwrap_or("");
 let local=host=="localhost"||host=="[::1]"||host=="::1"||host.ends_with(".local")||host.parse::<std::net::Ipv4Addr>().is_ok_and(|ip|ip.is_private()||ip.is_loopback());
 if !["https","http"].contains(&url.scheme())||url.scheme()=="http"&&!local||!url.username().is_empty()||url.password().is_some()||url.query().is_some()||url.fragment().is_some(){return Err("Use HTTPS, or HTTP for a local server, without credentials or query parameters.".into());}
 Ok(url.as_str().trim_end_matches('/').into())
}
fn short(v:&Value,key:&str,max:usize)->String{text(v,key).trim().chars().take(max).collect()}
fn standard_voices()->Value{json!(["alloy","ash","ballad","coral","echo","fable","nova","onyx","sage","shimmer","verse"])}
fn clean_model(model:&Value,preset:&Value)->Result<Value>{
 if preset["protocol"]=="higgsfield"{return video_catalog().as_array().unwrap().iter().find(|m|m["id"]==model["id"]).cloned().ok_or("Choose a supported Higgsfield video model.".into());}
 let id=short(model,"id",200);if id.is_empty()||id.contains(['\r','\n']){return Err("Enter a valid model ID.".into());}
 let kind=if text(model,"kind").is_empty(){"chat".into()}else{text(model,"kind")};
 if !preset["kinds"].as_array().is_some_and(|a|a.contains(&json!(kind))){return Err("This provider does not support that model type.".into());}
 let voices=if let Some(a)=model["voices"].as_array(){json!(a.iter().filter(|v|v.as_str().is_some_and(|s|s.len()<=200)).take(200).collect::<Vec<_>>())}else if kind=="speech"&&preset["protocol"]=="openai"{standard_voices()}else{json!([])};
 let labels=model["voiceLabels"].as_object().map(|m|m.iter().take(200).map(|(k,v)|(k.chars().take(200).collect::<String>(),json!(v.as_str().unwrap_or("").chars().take(200).collect::<String>()))).collect::<serde_json::Map<_,_>>()).unwrap_or_default();
 Ok(json!({"id":id,"name":if text(model,"name").is_empty(){id}else{short(model,"name",200)},"kind":kind,"voices":voices,"voiceLabels":labels}))
}
pub fn validate_voice_request(s:&Value,b:&Value)->Result<()>{
 let provider=s["settings"]["providers"].as_array().and_then(|a|a.iter().find(|p|p["id"]==b["provider"])).ok_or("Choose a connected provider in Settings.")?;
 let model=provider["models"].as_array().and_then(|a|a.iter().find(|m|m["id"]==b["engine"]&&m["kind"]=="speech")).ok_or("Choose a speech model from this provider.")?;
 if b["kind"]!="voice"||b["voiceMode"]!="preset"||!model["voices"].as_array().is_some_and(|a|a.contains(&b["voice"])){return Err("Choose a supported preset voice for this provider.".into());}Ok(())
}
#[derive(Clone)]
pub struct Providers{pub store:Store,secrets:Arc<Mutex<Value>>,client:reqwest::Client}
impl Providers{
 pub fn new(store:Store,secrets:Arc<Mutex<Value>>)->Self{Self{store,secrets,client:reqwest::Client::builder().redirect(reqwest::redirect::Policy::none()).timeout(Duration::from_secs(180)).build().expect("provider client")}}
 fn find(&self,id:&str)->Option<Value>{self.store.read()["settings"]["providers"].as_array().and_then(|a|a.iter().find(|p|p["id"]==id).cloned())}
 fn config(&self,b:&Value)->Result<Value>{
  let old=self.find(&text(b,"id")).unwrap_or(json!({}));let kind=if text(b,"type").is_empty(){text(&old,"type")}else{text(b,"type")};let all=presets();let preset=&all[&kind];if preset.is_null(){return Err("Choose a supported provider.".into());}
  let endpoint=if kind=="custom"{if text(b,"baseUrl").is_empty(){text(&old,"baseUrl")}else{text(b,"baseUrl")}}else{text(preset,"baseUrl")};
  let name=if short(b,"name",200).is_empty(){if text(&old,"name").is_empty(){text(preset,"name")}else{text(&old,"name")}}else{short(b,"name",200)};
  Ok(json!({"id":text(&old,"id"),"type":kind,"name":name,"baseUrl":checked_url(&endpoint)?,"protocol":preset["protocol"]}))
 }
 fn key(&self,cfg:&Value,b:&Value)->String{
  let provided=short(b,"apiKey",4000);if !provided.is_empty(){return provided;}
  let id=text(cfg,"id");if self.find(&id).is_some_and(|old|old["baseUrl"]==cfg["baseUrl"]){self.secrets.lock().unwrap()["providerKeys"][&id].as_str().unwrap_or("").into()}else{String::new()}
 }
 fn req(&self,cfg:&Value,key:&str,path:&str,method:reqwest::Method)->reqwest::RequestBuilder{
  let mut r=self.client.request(method,format!("{}{path}",text(cfg,"baseUrl")));
  if cfg["protocol"]=="anthropic"{r=r.header("x-api-key",key).header("anthropic-version","2023-06-01");}else if cfg["protocol"]=="elevenlabs"{r=r.header("xi-api-key",key);}else if !key.is_empty(){r=r.bearer_auth(key);}r
 }
 async fn response(cfg:&Value,response:std::result::Result<reqwest::Response,reqwest::Error>)->Result<reqwest::Response>{
  let r=response.map_err(|_|format!("Could not reach {}. Check the API endpoint.",text(cfg,"name")))?;if !r.status().is_success(){return Err(format!("{} returned HTTP {}. Check your key, endpoint, and model access.",text(cfg,"name"),r.status().as_u16()));}Ok(r)
 }
 async fn get(&self,cfg:&Value,key:&str,path:&str)->Result<Value>{Self::response(cfg,self.req(cfg,key,path,reqwest::Method::GET).send().await).await?.json().await.map_err(|_|"The provider returned an invalid response.".into())}
 pub fn public(&self)->Value{let keys=self.secrets.lock().unwrap();json!(self.store.read()["settings"]["providers"].as_array().unwrap_or(&vec![]).iter().map(|p|{let mut p=p.clone();p["configured"]=json!(p["type"]=="custom"||!keys["providerKeys"][text(&p,"id")].as_str().unwrap_or("").is_empty());p}).collect::<Vec<_>>())}
 fn voicestudio_config(&self,b:&Value)->Result<(Value,String)>{
  if !text(b,"id").is_empty()&&b["id"]!="voicestudio"{return Err("Provider not found.".into());}
  let saved=crate::voicestudio::validate_url(&text(&self.store.read()["settings"],"voicestudioUrl"))?;
  let base=crate::voicestudio::validate_url(b["baseUrl"].as_str().unwrap_or(&saved))?;if base.is_empty(){return Err("Enter your VoiceStudio server address.".into());}
  let supplied=short(b,"apiKey",4000);let key=if !supplied.is_empty(){supplied}else if base==saved{text(&self.secrets.lock().unwrap(),"voicestudioKey")}else{String::new()};
  if key.is_empty(){return Err("Enter your VoiceStudio API key. A new server address needs its own key.".into());}
  Ok((json!({"id":"voicestudio","type":"voicestudio","name":"VoiceStudio","baseUrl":base,"protocol":"voicestudio","models":presets()["voicestudio"]["models"],"defaultModels":{"speech":"omnivoice"}}),key))
 }
 pub async fn discover(&self,b:&Value)->Result<Value>{
  if b["type"]=="voicestudio"||b["id"]=="voicestudio"{let(cfg,key)=self.voicestudio_config(b)?;Self::response(&cfg,self.req(&cfg,&key,"/health",reqwest::Method::GET).send().await).await?;return Ok(json!({"models":cfg["models"]}));}
  let cfg=self.config(b)?;let key=self.key(&cfg,b);if cfg["type"]!="custom"&&key.is_empty(){return Err("Enter your API key.".into());}
  if cfg["protocol"]=="higgsfield"{return Ok(json!({"models":video_catalog()}));}
  let raw=self.get(&cfg,&key,"/models").await?;let list=raw.as_array().or(raw["data"].as_array()).ok_or("The endpoint did not return a model list. You can enter model IDs manually.")?;
  let voices=if cfg["protocol"]=="elevenlabs"{let mut vc=cfg.clone();vc["baseUrl"]=json!(text(&cfg,"baseUrl").trim_end_matches("/v1").to_string()+"/v2");let mut out=vec![];let mut token=String::new();loop{let path=format!("/voices?page_size=100{}",if token.is_empty(){String::new()}else{format!("&next_page_token={}",urlencoding_token(&token))});let page=self.get(&vc,&key,&path).await?;out.extend(page["voices"].as_array().cloned().unwrap_or_default());token=text(&page,"next_page_token");if page["has_more"]!=true||token.is_empty()||out.len()>=200{break;}}out.truncate(200);out}else{vec![]};
  let all=presets();let preset=&all[text(&cfg,"type")];let mut models=vec![];
  for m in list.iter().take(5000){let id=if text(m,"id").is_empty(){text(m,"model_id")}else{text(m,"id")};if id.is_empty(){continue;}let lower=id.to_lowercase();
   let kind=if cfg["protocol"]=="elevenlabs"{if m["can_do_text_to_speech"]!=true{continue;}"speech"}else if lower.contains("transcrib")||lower.contains("whisper"){"transcription"}else if lower.contains("tts")||lower.contains("text-to-speech")||m["architecture"]["output_modalities"].as_array().is_some_and(|a|a.contains(&json!("speech"))){"speech"}else{if ["embed","dall-e","image","moderation","realtime","sora","veo","imagen","music"].iter().any(|k|lower.contains(k)){continue;}"chat"};
   if !preset["kinds"].as_array().is_some_and(|a|a.contains(&json!(kind))){continue;}
   let mut candidate=json!({"id":id,"name":if !text(m,"name").is_empty(){text(m,"name")}else if !text(m,"display_name").is_empty(){text(m,"display_name")}else{id},"kind":kind});
   if cfg["protocol"]=="elevenlabs"{candidate["voices"]=json!(voices.iter().take(200).map(|v|v["voice_id"].clone()).collect::<Vec<_>>());candidate["voiceLabels"]=json!(voices.iter().take(200).map(|v|(text(v,"voice_id"),v["name"].clone())).collect::<serde_json::Map<_,_>>());}else if m["supported_voices"].is_array(){candidate["voices"]=m["supported_voices"].clone();}
   models.push(clean_model(&candidate,preset)?);
  }Ok(json!({"models":models}))
 }
 pub fn save(&self,b:&Value)->Result<Value>{
  if b["type"]=="voicestudio"||b["id"]=="voicestudio"{
   let(mut cfg,key)=self.voicestudio_config(b)?;
   if !b["models"].as_array().is_some_and(|a|a.len()==1&&a[0]["id"]=="omnivoice"&&a[0]["kind"]=="speech"){return Err("Choose the OmniVoice model for VoiceStudio.".into());}
   {let mut keys=self.secrets.lock().unwrap();let mut next=keys.clone();next["voicestudioKey"]=json!(key);write_atomic(&self.store.dir.join("secrets.json"),&next)?;*keys=next;}
   self.store.update(|s|{s["settings"]["voicestudioUrl"]=cfg["baseUrl"].clone();Ok(())})?;cfg["configured"]=json!(true);return Ok(cfg);
  }

  if !text(b,"id").is_empty()&&self.find(&text(b,"id")).is_none(){return Err("Provider not found.".into());}
  let mut cfg=self.config(b)?;let key=self.key(&cfg,b);if cfg["type"]!="custom"&&key.is_empty(){return Err("Enter your API key.".into());}
  let input=b["models"].as_array().filter(|a|!a.is_empty()&&a.len()<=100).ok_or("Choose between 1 and 100 models.")?;let all=presets();let preset=&all[text(&cfg,"type")];cfg["models"]=json!(input.iter().map(|m|clean_model(m,preset)).collect::<Result<Vec<_>>>()?);
  let old_defaults=self.find(&text(&cfg,"id")).map(|p|p["defaultModels"].clone()).unwrap_or(json!({}));
  cfg["defaultModels"]=json!(old_defaults.as_object().map(|o|o.iter().filter(|(kind,id)|cfg["models"].as_array().unwrap().iter().any(|m|m["kind"]==kind.as_str()&&m["id"]==**id)).map(|(k,v)|(k.clone(),v.clone())).collect::<serde_json::Map<_,_>>()).unwrap_or_default());
  if text(&cfg,"id").is_empty(){cfg["id"]=json!(format!("api:{}",uid()));}let id=text(&cfg,"id");
  {let mut secrets=self.secrets.lock().unwrap();let mut next=secrets.clone();next["providerKeys"][&id]=json!(key);write_atomic(&self.store.dir.join("secrets.json"),&next)?;*secrets=next;}
  self.store.update(|s|{if !s["settings"]["providers"].is_array(){s["settings"]["providers"]=json!([]);}let a=s["settings"]["providers"].as_array_mut().unwrap();if let Some(p)=a.iter_mut().find(|p|p["id"]==id){*p=cfg.clone();}else{a.push(cfg.clone());}Ok(())})?;cfg["configured"]=json!(!key.is_empty()||cfg["type"]=="custom");Ok(cfg)
 }
 pub fn remove(&self,id:&str)->Result<Value>{
  if id=="voicestudio"{self.store.update(|s|{s["settings"]["voicestudioUrl"]=json!("");if s["settings"]["voiceProvider"]=="voicestudio"{s["settings"]["voiceProvider"]=json!("");}Ok(())})?;let mut keys=self.secrets.lock().unwrap();let mut next=keys.clone();next.as_object_mut().unwrap().remove("voicestudioKey");write_atomic(&self.store.dir.join("secrets.json"),&next)?;*keys=next;return Ok(json!({"ok":true}));}

  if self.find(id).is_none(){return Err("Provider not found.".into());}
  self.store.update(|s|{s["settings"]["providers"].as_array_mut().unwrap().retain(|p|p["id"]!=id);for(route,_model)in[("chatProvider","model"),("voiceProvider","speechModel"),("transcriptionProvider","listeningModel"),("videoProvider","videoModel")]{if s["settings"][route]==id{s["settings"][route]=json!("");}}Ok(())})?;
  let mut secrets=self.secrets.lock().unwrap();if let Some(keys)=secrets["providerKeys"].as_object_mut(){keys.remove(id);}write_atomic(&self.store.dir.join("secrets.json"),&secrets)?;Ok(json!({"ok":true}))
 }
 fn selected(&self,id:&str,model_id:&str,kind:&str)->Result<(Value,Value,String)>{let cfg=self.find(id).ok_or("Choose a connected provider in Settings.")?;let model=cfg["models"].as_array().and_then(|a|a.iter().find(|m|m["id"]==model_id&&m["kind"]==kind)).cloned().ok_or("Choose a model from this provider.")?;let key=self.key(&cfg,&json!({}));Ok((cfg,model,key))}
 pub fn default_model(&self,id:&str,kind:&str)->String{let p=self.find(id).unwrap_or(json!({}));p["defaultModels"][kind].as_str().map(String::from).unwrap_or_else(||p["models"].as_array().and_then(|a|a.iter().find(|m|m["kind"]==kind)).map(|m|text(m,"id")).unwrap_or_default())}
 pub fn use_model(&self,b:&Value)->Result<Value>{if b["id"]=="voicestudio"{self.voicestudio_config(&json!({}))?;if b["kind"]!="speech"||b["model"]!="omnivoice"{return Err("Choose OmniVoice for VoiceStudio.".into());}return self.store.update(|s|{s["settings"]["voiceProvider"]=json!("voicestudio");Ok(json!({"ok":true}))});}let(cfg,model,_)=self.selected(&text(b,"id"),&text(b,"model"),&text(b,"kind"))?;let kind=text(&model,"kind");let route=match kind.as_str(){"chat"=>"chatProvider","speech"=>"voiceProvider","video"=>"videoProvider",_=>"transcriptionProvider"};self.store.update(|s|{let p=s["settings"]["providers"].as_array_mut().unwrap().iter_mut().find(|p|p["id"]==cfg["id"]).unwrap();p["defaultModels"][&kind]=model["id"].clone();s["settings"][route]=cfg["id"].clone();Ok(json!({"ok":true}))})}

 pub async fn chat(&self,id:&str,model_id:&str,messages:Value)->Result<Value>{
  let(cfg,_,key)=self.selected(id,model_id,"chat")?;let anthropic=cfg["protocol"]=="anthropic";
  let mut body=if anthropic{json!({"model":model_id,"max_tokens":4000,"system":messages.as_array().unwrap().iter().filter(|m|m["role"]=="system").map(|m|text(m,"content")).collect::<Vec<_>>().join("\n"),"messages":messages.as_array().unwrap().iter().filter(|m|m["role"]!="system").collect::<Vec<_>>()})}else{json!({"model":model_id,"max_tokens":4000,"messages":messages})};
  if cfg["type"]=="openai"{body.as_object_mut().unwrap().remove("max_tokens");body["max_completion_tokens"]=json!(4000);}
  let response=Self::response(&cfg,self.req(&cfg,&key,if anthropic{"/messages"}else{"/chat/completions"},reqwest::Method::POST).json(&body).send().await).await?;let result:Value=response.json().await.map_err(|_|"The provider returned an invalid response.")?;
  let output=if anthropic{result["content"].as_array().unwrap_or(&vec![]).iter().filter(|p|p["type"]=="text").map(|p|text(p,"text")).collect::<String>()}else{text(&result["choices"][0]["message"],"content")};if output.trim().is_empty(){return Err("The provider returned no usable text.".into());}Ok(json!({"text":output,"model":model_id}))
 }
 pub fn validate_voice(&self,b:&Value)->Result<()>{let(_,model,_)=self.selected(&text(b,"provider"),&text(b,"engine"),"speech")?;if b["kind"]!="voice"||b["voiceMode"]!="preset"||!model["voices"].as_array().is_some_and(|a|a.contains(&b["voice"])){return Err("Choose a supported preset voice for this provider.".into());}Ok(())}
 pub fn claim(&self,id:&str)->Result<()>{let s=self.store.read();let j=s["jobs"].as_array().unwrap().iter().find(|j|j["id"]==id).ok_or("Take not found.")?;self.validate_voice(j)?;self.store.update(|s|{let j=s["jobs"].as_array_mut().unwrap().iter_mut().find(|j|j["id"]==id).ok_or("Take not found.")?;if j["status"]!="prepared"{return Err("This take has already been submitted.".into());}j["status"]=json!("submitting");j["error"]=json!("");Ok(())})}
 pub async fn run(&self,id:String){if let Err(error)=self.speech(&id).await{let _=self.store.patch_job(&id,json!({"status":"failed","error":error,"updatedAt":now()}));}}
 async fn speech(&self,id:&str)->Result<()>{
  let s=self.store.read();let j=s["jobs"].as_array().unwrap().iter().find(|j|j["id"]==id).ok_or("Take not found.")?;let(cfg,_,key)=self.selected(&text(j,"provider"),&text(j,"engine"),"speech")?;let eleven=cfg["protocol"]=="elevenlabs";
  let path=if eleven{let mut url=reqwest::Url::parse("https://placeholder.invalid/").unwrap();url.path_segments_mut().unwrap().extend(["text-to-speech",&text(j,"voice")]);url.path().to_string()}else{"/audio/speech".into()};
  let body=if eleven{json!({"model_id":j["engine"],"text":j["text"]})}else{json!({"model":j["engine"],"input":j["text"],"voice":j["voice"],"response_format":"mp3"})};
  let mut response=Self::response(&cfg,self.req(&cfg,&key,&path,reqwest::Method::POST).json(&body).send().await).await?;let mime=response.headers().get("content-type").and_then(|h|h.to_str().ok()).unwrap_or("audio/mpeg").to_string();let mut bytes=vec![];while let Some(chunk)=response.chunk().await.map_err(|_|"Could not receive provider audio.")?{if bytes.len()+chunk.len()>128*1024*1024{return Err("Audio exceeds 128 MB.".into());}bytes.extend_from_slice(&chunk);}
  let(bytes,ext,mime)=crate::openrouter::decode_audio(bytes,&mime)?;let asset=json!({"id":uid(),"name":format!("{}.{ext}",text(j,"sectionTitle")),"type":mime,"size":bytes.len(),"createdAt":now()});std::fs::write(self.store.dir.join("media").join(text(&asset,"id")),bytes).map_err(|_|"Could not save provider audio.")?;
  self.store.update(|s|{s["assets"].as_array_mut().unwrap().push(asset.clone());let j=s["jobs"].as_array_mut().unwrap().iter_mut().find(|j|j["id"]==id).ok_or("Take not found.")?;j["status"]=json!("completed");j["outputId"]=asset["id"].clone();j["updatedAt"]=json!(now());Ok(())})
 }
 pub async fn listen(&self,id:&str,model:&str,asset_id:&str)->Result<Value>{
  let(cfg,_,key)=self.selected(id,model,"transcription")?;let asset=self.store.asset(asset_id)?;if !text(&asset,"type").starts_with("audio/"){return Err("Choose an audio recording.".into());}let bytes=tokio::fs::read(self.store.asset_path(&asset)?).await.map_err(|_|"Could not read recording.")?;if bytes.len()>128*1024*1024{return Err("Audio exceeds 128 MB.".into());}
  let boundary=format!("fikr{}",uid());let ext=if text(&asset,"type").contains("mpeg"){"mp3"}else if text(&asset,"type").contains("mp4"){"m4a"}else{"wav"};
  let mut body=format!("--{boundary}\r\nContent-Disposition: form-data; name=\"model\"\r\n\r\n{model}\r\n--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"audio.{ext}\"\r\nContent-Type: application/octet-stream\r\n\r\n").into_bytes();body.extend(bytes);body.extend(format!("\r\n--{boundary}--\r\n").as_bytes());
  let result:Value=Self::response(&cfg,self.req(&cfg,&key,"/audio/transcriptions",reqwest::Method::POST).header("content-type",format!("multipart/form-data; boundary={boundary}")).body(body).send().await).await?.json().await.map_err(|_|"The provider returned an invalid transcript.")?;if !result["text"].is_string(){return Err("The provider returned no transcript.".into());}Ok(json!({"text":result["text"],"model":model}))
 }
}
#[cfg(test)]
mod tests{use super::*;
 #[test]fn endpoints_reject_credential_urls_and_insecure_public_hosts(){for url in["file:///tmp/key","https://user:key@host.test/v1","http://api.example/v1","https://host.test/v1?token=key"]{assert!(checked_url(url).is_err());}assert_eq!(checked_url("http://localhost:1234/v1/").unwrap(),"http://localhost:1234/v1");}
 #[test]fn invalid_models_do_not_write_keys_and_endpoint_edits_do_not_reuse_keys(){let dir=tempfile::tempdir().unwrap();let store=Store::open(dir.path().into()).unwrap();let secrets=Arc::new(Mutex::new(json!({})));let client=Providers::new(store,secrets.clone());assert!(client.save(&json!({"type":"openai","apiKey":"private","models":[]})).is_err());assert!(secrets.lock().unwrap()["providerKeys"].is_null());let p=client.save(&json!({"type":"custom","name":"Local","baseUrl":"http://localhost:1234/v1","apiKey":"private","models":[{"id":"model","kind":"chat"}]})).unwrap();assert!(!client.public().to_string().contains("private"));let cfg=client.config(&json!({"id":p["id"],"type":"custom","baseUrl":"http://localhost:5678/v1"})).unwrap();assert!(client.key(&cfg,&json!({})).is_empty());}
 #[test]fn voicestudio_provider_preserves_existing_key_and_stable_voice_settings(){
  let dir=tempfile::tempdir().unwrap();let store=Store::open(dir.path().into()).unwrap();store.update(|s|{s["settings"]["voicestudioUrl"]=json!("http://localhost:9444");s["settings"]["voiceProvider"]=json!("voicestudio");s["settings"]["speechModel"]=json!("old/openrouter");Ok(())}).unwrap();
  let keys=Arc::new(Mutex::new(json!({"voicestudioKey":"dummy-existing"})));let p=Providers::new(store.clone(),keys.clone());let models=json!([{"id":"omnivoice","kind":"speech"}]);let saved=p.save(&json!({"id":"voicestudio","type":"voicestudio","baseUrl":"http://localhost:9444/","models":models})).unwrap();assert_eq!(saved["id"],"voicestudio");assert_eq!(saved["models"][0]["cloning"],true);assert!(!saved.to_string().contains("dummy-existing"));assert_eq!(keys.lock().unwrap()["voicestudioKey"],"dummy-existing");assert!(store.read()["settings"]["providers"].is_null());
  assert!(p.save(&json!({"type":"voicestudio","baseUrl":"http://localhost:9555","models":models})).is_err());assert_eq!(store.read()["settings"]["voicestudioUrl"],"http://localhost:9444");
  assert!(p.save(&json!({"type":"voicestudio","apiKey":"replacement","baseUrl":"http://localhost:9444","models":[{"id":"unknown","kind":"speech"}]})).is_err());assert_eq!(keys.lock().unwrap()["voicestudioKey"],"dummy-existing");
  p.use_model(&json!({"id":"voicestudio","model":"omnivoice","kind":"speech"})).unwrap();assert_eq!(store.read()["settings"]["voiceProvider"],"voicestudio");assert_eq!(store.read()["settings"]["speechModel"],"old/openrouter");p.remove("voicestudio").unwrap();assert!(keys.lock().unwrap()["voicestudioKey"].is_null());assert_eq!(store.read()["settings"]["voicestudioUrl"],"");
 }
 #[tokio::test]async fn native_chat_and_speech_use_selected_connection_without_worker(){
  use std::{io::{Read,Write},net::TcpListener};
  let listener=TcpListener::bind("127.0.0.1:0").unwrap();let address=listener.local_addr().unwrap();
  let server=std::thread::spawn(move||{for index in 0..2{let(mut stream,_)=listener.accept().unwrap();let mut bytes=vec![];loop{let mut buf=[0u8;2048];let n=stream.read(&mut buf).unwrap();bytes.extend_from_slice(&buf[..n]);if let Some(end)=bytes.windows(4).position(|w|w==b"\r\n\r\n"){let header=String::from_utf8_lossy(&bytes[..end]).to_lowercase();let len=header.lines().find_map(|l|l.strip_prefix("content-length: ").and_then(|v|v.parse::<usize>().ok())).unwrap_or(0);if bytes.len()>=end+4+len{break;}}}let request=String::from_utf8_lossy(&bytes);assert!(request.contains("authorization: Bearer dummy"));let(mime,body)=if index==0{assert!(request.contains("POST /v1/chat/completions"));assert!(request.contains("chat-test"));("application/json",r#"{"choices":[{"message":{"content":"Edited script"}}]}"#)}else{assert!(request.contains("POST /v1/audio/speech"));assert!(request.contains("alloy"));("audio/mpeg","ID3 test audio")};write!(stream,"HTTP/1.1 200 OK\r\nContent-Type: {mime}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",body.len()).unwrap();}});
  let dir=tempfile::tempdir().unwrap();let store=Store::open(dir.path().into()).unwrap();let client=Providers::new(store.clone(),Arc::new(Mutex::new(json!({}))));let p=client.save(&json!({"type":"custom","baseUrl":format!("http://{address}/v1"),"apiKey":"dummy","models":[{"id":"chat-test","kind":"chat"},{"id":"tts-test","kind":"speech"}]})).unwrap();let id=text(&p,"id");
  store.update(|s|{s["settings"]["model"]=json!("openrouter/original");Ok(())}).unwrap();client.use_model(&json!({"id":id,"model":"chat-test","kind":"chat"})).unwrap();assert_eq!(store.read()["settings"]["model"],"openrouter/original");assert_eq!(client.default_model(&id,"chat"),"chat-test");assert_eq!(client.chat(&id,"chat-test",json!([{"role":"user","content":"Edit"}])).await.unwrap()["text"],"Edited script");
  store.update(|s|{s["jobs"].as_array_mut().unwrap().push(json!({"id":"job","provider":id,"engine":"tts-test","kind":"voice","voiceMode":"preset","voice":"alloy","text":"Hello","sectionTitle":"Test","status":"prepared"}));Ok(())}).unwrap();client.claim("job").unwrap();assert!(client.claim("job").is_err());client.run("job".into()).await;assert_eq!(store.read()["jobs"][0]["status"],"completed");assert_eq!(store.read()["assets"].as_array().unwrap().len(),1);server.join().unwrap();
 }

}
