use crate::{store::{Store,Result,text},local_tts::LocalTts};
use serde_json::{json,Value};
use std::{path::PathBuf,sync::{Arc,Mutex},process::Stdio,time::Duration};
use tokio::io::AsyncWriteExt;
fn catalog()->Value {serde_json::from_str(include_str!("../../local-tts/language-catalog.json")).unwrap()}

#[cfg(test)]
mod profile_tests {
 use super::*;
 #[test]
 fn profile_transcription_is_validated_and_saved_independently(){
  let config=json!({"provider":"local","model":"whisper-small"});
  let saved=crate::local_tts::saved_voice(&json!({"transcription":config}),&json!({"settings":{"localTranscriptionModel":"whisper-base"}})).unwrap();
  assert_eq!(saved["transcription"],config);
  assert!(validate_profile_transcription(&json!({"provider":"local","model":"kokoro"})).is_err());
  assert!(validate_profile_transcription(&json!({"provider":"openrouter","model":""})).is_err());
  assert!(validate_profile_transcription(&json!({"provider":"https://example.com","model":"listen"})).is_err());
  assert_eq!(validate_profile_transcription(&json!({"provider":"api:test","model":"listen"})).unwrap()["model"],"listen");
  assert!(crate::local_tts::saved_voice(&json!({}),&json!({})).unwrap().get("transcription").is_none());
 }
}
pub fn validate_profile_transcription(value:&Value)->Result<Value>{
 let provider=text(value,"provider");let model=text(value,"model");
 let api_id=provider.strip_prefix("api:").is_some_and(|id|!id.is_empty()&&id.chars().all(|c|c.is_ascii_alphanumeric()||c=='_'||c=='-'));
 if !value.is_object()||(!["local","openrouter"].contains(&provider.as_str())&&!api_id)||model.trim().is_empty()||model.chars().count()>200{return Err("Choose a transcription provider and model in My Models.".into());}
 if provider=="local"&&!["whisper-base","whisper-small"].contains(&model.as_str()){return Err("Choose a Whisper transcription model.".into());}
 Ok(json!({"provider":provider,"model":model}))
}
pub fn validate_settings(b:&Value)->Result<()> {
    for (key,allowed) in [("transcriptionProvider",vec!["local","openrouter"]),("translationProvider",vec!["local","apple"])] {if b.get(key).is_some()&&!allowed.contains(&text(b,key).as_str())&&!(key=="transcriptionProvider"&&text(b,key).starts_with("api:")){return Err(format!("Choose a supported {key}."));}}
    if b.get("localTranscriptionModel").is_some()&&catalog()[text(b,"localTranscriptionModel")]["task"]!="transcribe" {return Err("Choose a local transcription model.".into());}Ok(())
}
pub fn validate_translation(b:&Value)->Result<()> {
    if !["local","apple"].contains(&text(b,"provider").as_str()){return Err("Choose a local translation provider.".into());}
    let content=text(b,"text");if content.trim().is_empty()||content.chars().count()>12000{return Err("Use 1–12,000 characters for translation.".into());}
    let source=text(b,"source");let target=text(b,"target");if source.is_empty()||target.is_empty()||source==target{return Err("Choose different source and target languages.".into());}
    if b["provider"]=="local"&&(catalog()["m2m100"]["languages"].get(&source).is_none()||catalog()["m2m100"]["languages"].get(&target).is_none()){return Err("The compact translator does not support this language pair.".into());}Ok(())
}
#[derive(Clone)]
pub struct LocalLanguage {store:Store,tts:LocalTts,resources:PathBuf,setup:Arc<Mutex<Value>>}
impl LocalLanguage {
    pub fn new(store:Store,tts:LocalTts,resources:PathBuf)->Self{Self{store,tts,resources,setup:Arc::new(Mutex::new(json!({"busy":false,"error":""})))}}
    async fn apple(&self,request:Value)->Result<Value>{
        let binary=crate::app_data::local_tool(&self.resources,"apple-language");if !binary.exists(){return Ok(json!({"available":false,"languages":[],"reason":"Apple Foundation Models requires the Mac app on macOS 26 or later."}));}
        let mut child=tokio::process::Command::new(binary).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped()).kill_on_drop(true).spawn().map_err(|e|e.to_string())?;
        let mut input=child.stdin.take().ok_or("Apple model input is unavailable")?;input.write_all(&serde_json::to_vec(&request).unwrap()).await.map_err(|e|e.to_string())?;drop(input);
        let output=tokio::time::timeout(Duration::from_secs(180),child.wait_with_output()).await.map_err(|_|"Apple translation timed out. Try a shorter passage.")?.map_err(|e|e.to_string())?;
        let result:Value=serde_json::from_slice(&output.stdout).map_err(|_|"Apple Foundation Models returned no result.")?;
        if !output.status.success()||result["error"].is_string(){return Err(text(&result,"error"));}Ok(result)
    }
    fn ready(&self,id:&str)->bool {let spec=&catalog()[id];let root=self.store.dir.join("local-tts");let marker=std::fs::read(root.join(format!("language-{id}.ready.json"))).ok().and_then(|v|serde_json::from_slice::<Value>(&v).ok());marker.is_some_and(|v|v["revision"]==spec["revision"]&&v["runtimeVersion"].as_u64().unwrap_or(1)==spec["runtimeVersion"].as_u64().unwrap_or(1)&&v["processorRevision"]==spec["processorRevision"])&&root.join("venv/bin/python").exists()}
    pub async fn status(&self)->Value {let mut models=catalog();for (id,spec) in models.as_object_mut().unwrap(){spec["ready"]=json!(self.ready(id));}let apple=self.apple(json!({"operation":"status"})).await.unwrap_or_else(|e|json!({"available":false,"languages":[],"reason":e}));let mut status=self.setup.lock().unwrap().clone();status["supported"]=json!(cfg!(all(target_os="macos",target_arch="aarch64")));status["models"]=models;status["apple"]=apple;status}
    pub fn download(&self,id:String)->Result<Value>{if catalog()[&id].is_null(){return Err("Choose a local language model.".into());}if !cfg!(all(target_os="macos",target_arch="aarch64")){return Err("Local models require an Apple Silicon Mac.".into());}{let mut setup=self.setup.lock().unwrap();if setup["busy"]==true{return Err("A language model is already downloading.".into());}*setup=json!({"busy":true,"model":id,"error":""});}let client=self.clone();tauri::async_runtime::spawn(async move{let result=client.tts.language_process("download",json!({"model":id})).await;let mut setup=client.setup.lock().unwrap();setup["busy"]=json!(false);if let Err(e)=result{setup["error"]=json!(e);}});Ok(json!({"ok":true}))}
    pub async fn listen(&self,b:&Value)->Result<Value>{let state=self.store.read();let model=b["model"].as_str().or(state["settings"]["localTranscriptionModel"].as_str()).unwrap_or("whisper-base");let spec=&catalog()[model];if spec["task"]!="transcribe"{return Err("Choose a local transcription model.".into());}let language=b["language"].as_str().unwrap_or("auto");if language!="auto"&&spec["languages"].get(language).is_none(){return Err("This transcription model does not support that language.".into());}let task=b["task"].as_str().unwrap_or("transcribe");if !["transcribe","translate"].contains(&task){return Err("Choose transcription or translation to English.".into());}if !self.ready(model){return Err("Download the local transcription model in Settings → Transcription first.".into());}let asset=state["assets"].as_array().unwrap().iter().find(|a|a["id"]==b["assetId"]&&text(a,"type").starts_with("audio/")).ok_or("Choose an audio recording.")?;let path=self.store.asset_path(asset)?;self.tts.language_process("transcribe",json!({"model":model,"language":language,"task":task,"input":path})).await}
    pub async fn translate(&self,mut b:Value)->Result<Value>{if b.get("provider").is_none(){b["provider"]=self.store.read()["settings"]["translationProvider"].as_str().map(|s|json!(s)).unwrap_or(json!("local"));}validate_translation(&b)?;if b["provider"]=="apple"{let status=self.apple(json!({"operation":"status"})).await?;if status["available"]!=true{return Err(text(&status,"reason"));}for key in ["source","target"]{let code=text(&b,key);if !status["languages"].as_array().is_some_and(|a|a.iter().any(|v|v.as_str().is_some_and(|s|s.split('-').next()==Some(&code)))){return Err("Apple Foundation Models does not support this language pair. Choose Compact multilingual.".into());}}b["operation"]=json!("translate");return self.apple(b).await;}if !self.ready("m2m100"){return Err("Download Compact multilingual in Settings → Translation first.".into());}b["model"]=json!("m2m100");self.tts.language_process("translate",b).await}
}
#[cfg(test)] mod tests {use super::*;#[test]fn validates_routes(){assert!(validate_settings(&json!({"translationProvider":"apple","localTranscriptionModel":"whisper-base"})).is_ok());assert!(validate_settings(&json!({"transcriptionProvider":"apple"})).is_err());assert!(validate_translation(&json!({"provider":"local","source":"en","target":"ml","text":"Hello"})).is_ok());assert!(validate_translation(&json!({"provider":"local","source":"en","target":"te","text":"Hello"})).is_err());}}
