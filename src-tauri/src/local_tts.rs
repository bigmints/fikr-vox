use crate::store::{now, text, uid, Result, Store};
use serde_json::{json, Value};
use std::{path::PathBuf, sync::{Arc, Mutex}, time::Duration, process::Stdio};
use tokio::io::AsyncWriteExt;

pub fn catalog() -> Value { serde_json::from_str(include_str!("../../local-tts/catalog.json")).unwrap() }
pub fn is_preset(engine: &str) -> bool { ["kokoro", "qwen3-custom", "omnivoice-presets"].contains(&engine) }
pub fn is_design(engine: &str) -> bool { ["qwen3-design", "omnivoice-design"].contains(&engine) }
pub fn is_clone(engine: &str) -> bool { ["qwen3", "qwen3-hq", "omnivoice"].contains(&engine) }
pub fn speech_options(value: Option<&Value>) -> Result<Value> {
    if value.is_some_and(|v|!v.is_object()) {return Err("Invalid speech controls".into());}
    let mut result=json!({});
    for (key,min,max,fallback) in [("speed",0.75,1.5,1.0),("sentencePause",0.0,2.0,0.0),("volume",0.0,2.0,1.0)] {
        let n=match value.and_then(|v|v.get(key)) {Some(v)=>v.as_f64().ok_or_else(||format!("Invalid speech {key}"))?,None=>fallback};
        if !n.is_finite()||n<min||n>max {return Err(format!("Invalid speech {key}. Use {min}–{max}"));}
        result[key]=json!(n);
    }
    Ok(result)
}
pub fn voice_speech(profile: &Value, settings: &Value) -> Result<Value> {
    let mut merged=json!({});
    for source in [settings.get("localSpeech"),profile.get("localSpeech")].into_iter().flatten() {
        if !source.is_object(){return Err("Invalid speech controls".into());}
        for key in ["speed","sentencePause","volume"]{if let Some(value)=source.get(key){merged[key]=value.clone();}}
    }
    speech_options(Some(&merged))
}

pub fn validate(b: &Value, language: &str, transcript: &str) -> Result<()> {
    speech_options(b.get("speech"))?;
    let c=catalog(); let m=&c[text(b,"engine")];
    if b["kind"]!="voice" || m.is_null() {return Err("Choose a supported local speech model".into());}
    if m["languages"][language].is_null() {return Err("This local model does not support the selected language".into());}
    if is_preset(&text(b,"engine")) && m["voices"][text(b,"voice")].is_null() {return Err("Choose a supported preset voice".into());}
    if b["engine"]=="kokoro" && m["voiceLanguages"][text(b,"voice")]!=language {return Err("Choose a Kokoro voice matching the selected language".into());}
    if is_clone(&text(b,"engine")) && transcript.trim().is_empty() {return Err("Add the exact voice recording transcript to your twin".into());}
    if b.get("instruct").is_some_and(|v| !v.is_string()) || text(b,"instruct").chars().count()>2000 {return Err("Use a voice instruction of at most 2,000 characters".into());}
    if is_design(&text(b,"engine")) && text(b,"instruct").trim().is_empty() {return Err("Describe the voice you want to create".into());}
    Ok(())
}

pub fn prepare_preview(b: &Value, state: &Value) -> Result<Value> {
    let clone=is_clone(&text(b,"engine"));
    let transcript=text(b,"voiceTranscript").trim().to_string();
    let mut request=b.clone();request["kind"]=json!("voice");validate(&request,&text(b,"language"),&transcript)?;
    if clone&&!state["assets"].as_array().is_some_and(|assets|assets.iter().any(|a|a["id"]==b["voiceAssetId"]&&text(a,"type").starts_with("audio/"))){return Err("Add a voice recording before previewing your cloned voice".into());}
    if transcript.chars().count()>3000{return Err("Use a recording transcript of at most 3,000 characters".into());}
    let words=text(b,"text");if words.trim().is_empty() || words.chars().count()>300 {return Err("Use 1–300 characters for a voice preview".into());}
    let mut job=json!({"id":uid(),"kind":"voice","purpose":"voice-preview","provider":"local","engine":b["engine"],"voice":text(b,"voice"),"voiceMode":if clone {"clone"} else if is_design(&text(b,"engine")) {"design"} else {"preset"},"language":b["language"],"text":words.trim(),"instruct":text(b,"instruct"),"inputs":if clone {json!({"voice":b["voiceAssetId"]})} else {json!({})},"referenceText":transcript,"projectId":"","sectionId":"","projectTitle":"Voice previews","sectionTitle":if clone {"My cloned voice"} else {"Voice preview"},"status":"queued","stage":"Waiting for local engine","createdAt":now(),"updatedAt":now(),"approved":false});
    if b.get("speech").is_some(){job["speech"]=speech_options(b.get("speech"))?;}
    Ok(job)
}

pub fn saved_voice(b: &Value, state: &Value) -> Result<Value> {
    let language=if text(b,"localVoiceLanguage").is_empty(){"en".to_string()}else{text(b,"localVoiceLanguage")};
    if b.get("voiceLanguage").is_some_and(|v|!v.is_string()){return Err("Choose a supported voice language".into());}
let voice_language=if text(b,"voiceLanguage").is_empty(){language.clone()}else{text(b,"voiceLanguage")};
if !["en","ml","ar","hi","es","fr","zh","ja","ko","de","ru","pt","it","ta","te","kn","bn","mr","gu","ur","as","or","ne","si","tr","id","vi","th","nl","pl","sv","uk"].contains(&voice_language.as_str()){return Err("Choose a supported voice language".into());}
let mut fields=json!({"voiceLanguage":voice_language,"localEngine":text(b,"localEngine"),"localVoice":text(b,"localVoice"),"localVoiceInstruction":text(b,"localVoiceInstruction"),"localVoiceLanguage":language,"voicePreviewJobId":text(b,"voicePreviewJobId"),"voiceDesign":if ["qwen3-hq","omnivoice"].contains(&text(b,"localEngine").as_str()) {b["voiceDesign"].clone()} else {Value::Null}});
    if let Some(value)=b.get("transcription") {fields["transcription"]=crate::local_language::validate_profile_transcription(value)?;}
    if b.get("localSpeech").is_some(){fields["localSpeech"]=speech_options(b.get("localSpeech"))?;}
    for key in ["speechModel","voiceEngine","voiceMode","voice"] {
        if b.get(key).is_some_and(|v|!v.is_string())||text(b,key).chars().count()>200{return Err(format!("Use a valid voice {key}"));}
        fields[key]=json!(text(b,key));
    }
    if !text(b,"voiceMode").is_empty()&&!["preset","clone"].contains(&text(b,"voiceMode").as_str()){return Err("Choose a preset voice or a recording".into());}
    if text(b,"localVoiceInstruction").chars().count()>2000{return Err("Use at most 2,000 characters for voice instructions".into());}
    if b["voiceProvider"]!="local" {return Ok(fields);}
    let c=catalog();let model=&c[text(b,"localEngine")];if model.is_null(){return Err("Choose a local voice model".into());}
    if model["mode"]=="preset" {validate(&json!({"kind":"voice","engine":b["localEngine"],"voice":b["localVoice"],"instruct":text(b,"localVoiceInstruction")}),&language,"")?;}
    if model["mode"]=="design" {
        let j=state["jobs"].as_array().unwrap().iter().find(|j|j["id"]==b["voicePreviewJobId"]&&j["purpose"]=="voice-preview"&&j["engine"]==b["localEngine"]&&j["status"]=="completed").ok_or("Generate and choose a preview of this voice before saving")?;
        if !state["assets"].as_array().unwrap().iter().any(|a|a["id"]==j["outputId"]&&a["type"]=="audio/wav") || j["instruct"]!=fields["localVoiceInstruction"] || j["language"]!=language {return Err("Generate and choose a preview of this voice before saving".into());}
        if !j["duration"].as_f64().is_some_and(|n|(3.0..=30.0).contains(&n)){return Err("Generate a voice preview between 3 and 30 seconds before saving".into());}
        if b.get("localSpeech").is_some()&&speech_options(b.get("localSpeech"))?!=speech_options(j.get("speech"))?{return Err("Preview this delivery speed before saving".into());}
        if j.get("speech").is_some(){fields["localSpeech"]=speech_options(j.get("speech"))?;}
        fields["localEngine"]=model["cloneEngine"].clone();fields["localVoice"]=json!("");fields["voiceAssetId"]=j["outputId"].clone();fields["voiceTranscript"]=j["text"].clone();fields["voiceDesign"]=json!({"engine":j["engine"],"instruct":j["instruct"],"language":j["language"],"previewJobId":j["id"],"speech":speech_options(j.get("speech"))?});
    }
    Ok(fields)
}
#[derive(Clone)]
pub struct LocalTts {
    store: Store,
    resources: PathBuf,
    setup: Arc<Mutex<Value>>,
    gate: Arc<tokio::sync::Mutex<()>>,
}
impl LocalTts {
    pub fn new(store: Store, resources: PathBuf) -> Self {Self {store, resources, setup:Arc::new(Mutex::new(json!({"busy":false,"error":""}))),gate:Arc::new(tokio::sync::Mutex::new(()))}}
    fn root(&self)->PathBuf {self.store.dir.join("local-tts")}
    pub fn status(&self)->Value {
        let mut models=catalog();
        for (key,spec) in models.as_object_mut().unwrap() {
            let marker=std::fs::read(self.root().join(format!("{}.ready.json",spec["cacheEngine"].as_str().unwrap_or(key)))).ok().and_then(|v|serde_json::from_slice::<Value>(&v).ok());
            spec["ready"]=json!(marker.is_some_and(|v|v["revision"]==spec["revision"] && v["runtimeVersion"].as_u64().unwrap_or(1)==spec["runtimeVersion"].as_u64().unwrap_or(1)) && self.root().join("venv/bin/python").exists());
        }
        let mut status=self.setup.lock().unwrap().clone();status["models"]=models;
        status["supported"]=json!(cfg!(all(target_os="macos",target_arch="aarch64")));status
    }
    pub async fn language_process(&self, operation:&str, request:Value)->Result<Value> {
        let _guard=self.gate.lock().await;
        self.process_script("language.py",operation,request).await
    }
    async fn process(&self, operation:&str, request:Value)->Result<Value> {self.process_script("engine.py",operation,request).await}
    async fn process_script(&self, script:&str, operation:&str, request:Value)->Result<Value> {
        let root=self.root();tokio::fs::create_dir_all(&root).await.map_err(|e|e.to_string())?;
        let mut cmd=tokio::process::Command::new(if operation!="download" {root.join("venv/bin/python")} else {crate::app_data::local_tool(&self.resources,"uv")});
        if operation=="download" {cmd.args(["run","--project"]).arg(&self.resources).args(["--frozen","--python","3.11","--managed-python","python"]);}
        cmd.arg(self.resources.join(script)).arg(&root).arg(operation)
            .env("MYTWIN_PARENT_PID",std::process::id().to_string())
            .env("UV_PROJECT_ENVIRONMENT",root.join("venv")).env("UV_PYTHON_INSTALL_DIR",root.join("python"))
            .env("UV_CACHE_DIR",root.join("cache")).env("HF_HOME",root.join("models")).env("HF_HUB_DISABLE_TELEMETRY","1")
            .stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped()).kill_on_drop(true);
        let mut child=cmd.spawn().map_err(|e|format!("Could not start built-in speech: {e}"))?;
        let mut stdin=child.stdin.take().ok_or("Local engine input is unavailable")?;
        stdin.write_all(&serde_json::to_vec(&request).unwrap()).await.map_err(|e|e.to_string())?;drop(stdin);
        let output=tokio::time::timeout(Duration::from_secs(if operation=="download" {3600}else{1800}),child.wait_with_output()).await.map_err(|_|"Local speech timed out. Retry or use a shorter script.")?.map_err(|e|e.to_string())?;
        let result=serde_json::from_slice::<Value>(&output.stdout).ok();
        if !output.status.success() || result.as_ref().is_some_and(|v|v.get("error").is_some()) {
            if let Some(v)=result {if v["error"].is_string(){return Err(text(&v,"error"));}}
            let log=String::from_utf8_lossy(&output.stderr);return Err(format!("Local speech failed: {}",log.chars().rev().take(2000).collect::<String>().chars().rev().collect::<String>()));
        }
        result.ok_or("Local engine returned no result".into())
    }
    pub fn download(&self,engine:String)->Result<Value> {
        if catalog()[&engine].is_null(){return Err("Unknown local model".into());}
        if self.status()["supported"]!=true{return Err("Built-in speech requires an Apple Silicon Mac".into());}
        {let mut setup=self.setup.lock().unwrap();if setup["busy"]==true{return Err("A local download is already in progress".into());}*setup=json!({"busy":true,"engine":engine,"error":""});}
        let client=self.clone();tauri::async_runtime::spawn(async move {
            let _guard=client.gate.lock().await;
            let result=client.process("download",json!({"engine":engine})).await;
            let mut setup=client.setup.lock().unwrap();setup["busy"]=json!(false);if let Err(e)=result{setup["error"]=json!(e);}
        });Ok(json!({"ok":true}))
    }
    pub fn preview(&self,b:&Value)->Result<Value> {
        let job=prepare_preview(b,&self.store.read())?;
        if self.status()["models"][text(&job,"engine")]["ready"]!=true {return Err("Download this model in Settings → Local speech first".into());}
        self.store.update(|s|{s["jobs"].as_array_mut().unwrap().insert(0,job.clone());Ok(())})?;
        let client=self.clone();let id=text(&job,"id");tauri::async_runtime::spawn(async move{client.run(id).await;});Ok(job)
    }
    pub fn claim(&self,id:&str)->Result<()> {self.store.update(|s|{
        let j=s["jobs"].as_array_mut().unwrap().iter_mut().find(|j|j["id"]==id).ok_or("Take not found")?;
        if j["provider"]!="local"||j["status"]!="prepared"{return Err("This take has already been submitted. Generate a new take.".into());}
        j["status"]=json!("queued");j["stage"]=json!("Waiting for local engine");Ok(())
    })}
    pub fn cancel(&self,id:&str)->Result<()> {self.store.update(|s|{
        let j=s["jobs"].as_array_mut().unwrap().iter_mut().find(|j|j["id"]==id).ok_or("Take not found")?;
        if !["prepared","queued"].contains(&text(j,"status").as_str()){return Err("Local inference is already running. Wait for this take to finish.".into());}
        j["status"]=json!("cancelled");Ok(())
    })}
    pub async fn run(&self,id:String) {
        let _guard=self.gate.lock().await;
        if let Err(e)=self.generate(&id).await{let _=self.store.patch_job(&id,json!({"status":"failed","error":e}));}
    }
    async fn generate(&self,id:&str)->Result<()> {
        let mut j=self.store.read()["jobs"].as_array().unwrap().iter().find(|j|j["id"]==id).cloned().ok_or("Take not found")?;
        if j["status"]!="queued"{return Ok(());}
        if self.status()["models"][text(&j,"engine")]["ready"]!=true{return Err("Download this model in Settings → Local speech first".into());}
        validate(&j,&text(&j,"language"),&text(&j,"referenceText"))?;
        if text(&j,"text").chars().count()>12000{return Err("Split local scripts into takes of at most 12,000 characters".into());}
        if is_clone(&text(&j,"engine")) {let a=self.store.asset(&text(&j["inputs"],"voice"))?;if !text(&a,"type").starts_with("audio/"){return Err("Choose a voice recording".into());}j["reference"]=json!(self.store.asset_path(&a)?);}
        let aid=uid();let output=self.store.dir.join("media").join(format!("{aid}.wav"));j["output"]=json!(output);
        let started=self.store.update(|s|{let j=s["jobs"].as_array_mut().unwrap().iter_mut().find(|j|j["id"]==id).ok_or("Take not found")?;if j["status"]!="queued"{return Ok(false);}j["status"]=json!("running");j["stage"]=json!("Generating speech on this Mac");Ok(true)})?;
        if !started{return Ok(());}
        let result=self.process("generate",j.clone()).await;
        let saved=(||->Result<()> {
            let result=result?;
            if is_design(&text(&j,"engine")) && !result["duration"].as_f64().is_some_and(|n|(3.0..=30.0).contains(&n)) {return Err("This design preview must be 3–30 seconds. Adjust the preview text and try again".into());}
            if std::fs::metadata(&output).map_err(|e|e.to_string())?.len()>128*1024*1024{return Err("Local audio exceeds 128 MB".into());}
            let bytes=std::fs::read(&output).map_err(|e|e.to_string())?;
            if bytes.len()<=44||bytes.len()>128*1024*1024||&bytes[..4]!=b"RIFF"||&bytes[8..12]!=b"WAVE"{return Err("Local engine returned invalid WAV audio".into());}
            self.store.update(|s|{
                s["assets"].as_array_mut().unwrap().push(json!({"id":aid,"fileName":format!("{aid}.wav"),"name":format!("{}.wav",text(&j,"sectionTitle")),"type":"audio/wav","size":bytes.len(),"createdAt":now()}));
                let job=s["jobs"].as_array_mut().unwrap().iter_mut().find(|v|v["id"]==id).ok_or("Take not found")?;
                job["status"]=json!("completed");job["stage"]=json!("Ready");job["outputId"]=json!(aid);job["duration"]=result["duration"].clone();if result["designAttributes"].is_string(){job["designAttributes"]=result["designAttributes"].clone();}job["updatedAt"]=json!(now());Ok(())
            })
        })();
        if saved.is_err(){let _=std::fs::remove_file(&output);}let _=std::fs::remove_file(output.with_extension("partial.wav"));saved
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn designed_voice_keeps_previewed_delivery_defaults() {
        let body=json!({"engine":"omnivoice-design","language":"ml","text":"നമസ്കാരം","instruct":"female, casual conversational tone","speech":{"speed":1.2,"sentencePause":0,"volume":1}});
        let mut job=prepare_preview(&body,&json!({"assets":[]})).unwrap();assert_eq!(job["speech"]["speed"],1.2);
        job["status"]=json!("completed");job["outputId"]=json!("ref");job["duration"]=json!(6);
        let state=json!({"jobs":[job],"assets":[{"id":"ref","type":"audio/wav"}]});let mut save=json!({"voiceProvider":"local","localEngine":"omnivoice-design","localVoiceLanguage":"ml","localVoiceInstruction":body["instruct"],"localSpeech":body["speech"],"voicePreviewJobId":job["id"]});
        let fields=saved_voice(&save,&state).unwrap();assert_eq!(fields["localSpeech"]["speed"],1.2);assert_eq!(fields["voiceDesign"]["speech"]["speed"],1.2);
        save["localSpeech"]["speed"]=json!(1.1);assert!(saved_voice(&save,&state).is_err());
        let controls=voice_speech(&json!({"localSpeech":{"speed":1.2}}),&json!({"localSpeech":{"speed":0.9,"volume":0.8}})).unwrap();assert_eq!(controls["speed"],1.2);assert_eq!(controls["volume"],0.8);
    }
    #[test] fn omnivoice_descriptions_save_the_exact_selected_reference() {
        let request=json!({"engine":"omnivoice-design","language":"ml","text":"നമസ്കാരം","instruct":"A young adult woman with a low pitch."});
        let mut job=prepare_preview(&request,&json!({"assets":[]})).unwrap();assert_eq!(job["voiceMode"],"design");assert_eq!(job["inputs"],json!({}));
        job["status"]=json!("completed");job["outputId"]=json!("reference");job["duration"]=json!(8);
        let state=json!({"jobs":[job],"assets":[{"id":"reference","type":"audio/wav"}]});
        let body=json!({"voiceProvider":"local","localEngine":"omnivoice-design","localVoiceLanguage":"ml","voiceLanguage":"ml","localVoiceInstruction":request["instruct"],"voicePreviewJobId":job["id"]});
        let saved=saved_voice(&body,&state).unwrap();assert_eq!(saved["localEngine"],"omnivoice");assert_eq!(saved["voiceAssetId"],"reference");assert_eq!(saved["voiceTranscript"],request["text"]);assert_eq!(saved["voiceDesign"]["engine"],"omnivoice-design");
        let mut wrong=state.clone();wrong["jobs"][0]["engine"]=json!("qwen3-design");assert!(saved_voice(&body,&wrong).is_err());
        let mut changed=body.clone();changed["localVoiceInstruction"]=json!("Different description");assert!(saved_voice(&changed,&state).is_err());
    }
    #[test] fn ready_made_malayalam_voices_need_no_recording() {
        let state=json!({"assets":[],"jobs":[]});
        for voice in catalog()["omnivoice-presets"]["voices"].as_object().unwrap().keys() {
            let b=json!({"engine":"omnivoice-presets","voice":voice,"language":"ml","text":"നമസ്കാരം"});
            let job=prepare_preview(&b,&state).unwrap();assert_eq!(job["voiceMode"],"preset");assert_eq!(job["inputs"],json!({}));
            let saved=saved_voice(&json!({"voiceProvider":"local","localEngine":"omnivoice-presets","localVoice":voice,"voiceLanguage":"ml","localVoiceLanguage":"ml"}),&state).unwrap();assert_eq!(saved["localVoice"],*voice);
        }
        assert!(validate(&json!({"kind":"voice","engine":"omnivoice-presets","voice":"invalid"}),"ml","").is_err());
        let dir=tempfile::tempdir().unwrap();let store=Store::open(dir.path().into()).unwrap();let root=dir.path().join("local-tts");std::fs::create_dir_all(root.join("venv/bin")).unwrap();std::fs::write(root.join("venv/bin/python"),"").unwrap();
        std::fs::write(root.join("omnivoice.ready.json"),serde_json::to_vec(&json!({"revision":catalog()["omnivoice"]["revision"]})).unwrap()).unwrap();
        assert_eq!(LocalTts::new(store,dir.path().into()).status()["models"]["omnivoice-presets"]["ready"],true);
    }
    #[test] fn multilingual_clone_validates_and_keeps_reference() {
        let state=json!({"assets":[{"id":"ref","type":"audio/wav"}]});
        let b=json!({"engine":"omnivoice","language":"ml","text":"നമസ്കാരം","voiceAssetId":"ref","voiceTranscript":"Exact recorded words."});
        let job=prepare_preview(&b,&state).unwrap();assert_eq!(job["inputs"]["voice"],"ref");assert_eq!(job["language"],"ml");assert_eq!(job["voiceMode"],"clone");
        for (language,_) in catalog()["omnivoice"]["languages"].as_object().unwrap() { assert!(saved_voice(&json!({"voiceLanguage":language}),&state).is_ok()); }
        assert!(validate(&json!({"kind":"voice","engine":"qwen3"}),"ml","Exact words").is_err());
        assert!(validate(&json!({"kind":"voice","engine":"omnivoice"}),"ml","").is_err());
    }
    #[test] fn cloud_twin_preferences_are_preserved_and_validated() {
        let b=json!({"voiceProvider":"openrouter","speechModel":"provider/model","voiceMode":"preset","voice":"warm"});
        let saved=saved_voice(&b,&json!({})).unwrap();assert_eq!(saved["speechModel"],"provider/model");assert_eq!(saved["voice"],"warm");
        assert!(saved_voice(&json!({"voiceMode":"invalid"}),&json!({})).is_err());
        assert!(saved_voice(&json!({"speechModel":"x".repeat(201)}),&json!({})).is_err());
    }
    #[test] fn cloned_previews_snapshot_a_valid_recording() {
        let state=json!({"assets":[{"id":"ref","type":"audio/wav"}]});
        let mut b=json!({"engine":"qwen3-hq","language":"en","text":"Trying a new sentence.","voiceAssetId":"ref","voiceTranscript":"Original words."});
        let job=prepare_preview(&b,&state).unwrap();assert_eq!(job["inputs"]["voice"],"ref");assert_eq!(job["referenceText"],"Original words.");assert_eq!(job["voiceMode"],"clone");
        assert!(prepare_preview(&b,&json!({"assets":[]})).is_err());
        assert!(prepare_preview(&b,&json!({"assets":[{"id":"ref","type":"video/mp4"}]})).is_err());
        b["voiceTranscript"]=json!("");assert!(prepare_preview(&b,&state).is_err());
        b["voiceTranscript"]=json!("x".repeat(3001));assert!(prepare_preview(&b,&state).is_err());
    }
    #[test] fn all_presets_validate_with_correct_languages() {
        let c=catalog();assert_eq!(c["kokoro"]["voices"].as_object().unwrap().len(),54);
        for (voice,language) in c["kokoro"]["voiceLanguages"].as_object().unwrap(){
            let b=json!({"kind":"voice","engine":"kokoro","voice":voice});
            assert!(validate(&b,language.as_str().unwrap(),"").is_ok());
            assert!(validate(&b,if language=="en"{"ja"}else{"en"},"").is_err());
        }
        for voice in c["qwen3-custom"]["voices"].as_object().unwrap().keys(){assert!(validate(&json!({"kind":"voice","engine":"qwen3-custom","voice":voice}),"en","").is_ok());}
    }
    #[test] fn design_save_requires_matching_completed_preview() {
        let mut job=prepare_preview(&json!({"engine":"qwen3-design","language":"en","text":"Exact preview words.","instruct":"Warm female voice"}),&json!({})).unwrap();
        job["status"]=json!("completed");job["outputId"]=json!("audio");job["duration"]=json!(8);
        let state=json!({"jobs":[job.clone()],"assets":[{"id":"audio","type":"audio/wav"}]});
        let mut b=json!({"voiceProvider":"local","localEngine":"qwen3-design","localVoiceLanguage":"en","localVoiceInstruction":job["instruct"],"voicePreviewJobId":job["id"]});
        let saved=saved_voice(&b,&state).unwrap();assert_eq!(saved["localEngine"],"qwen3-hq");assert_eq!(saved["voiceAssetId"],"audio");assert_eq!(saved["voiceTranscript"],job["text"]);
        b["localVoiceInstruction"]=json!("Different voice");assert!(saved_voice(&b,&state).is_err());
        assert!(prepare_preview(&json!({"engine":"qwen3-design","language":"en","text":"Hello"}),&json!({})).is_err());
    }
    #[test]
    fn validates_delivery_controls() {
        assert_eq!(speech_options(None).unwrap(), json!({"speed":1.0,"sentencePause":0.0,"volume":1.0}));
        assert_eq!(speech_options(Some(&json!({"speed":1.25}))).unwrap()["speed"], 1.25);
        for value in [json!(null),json!([]),json!({"speed":0}),json!({"volume":3}),json!({"sentencePause":-1}),json!({"speed":"1"})] {
            assert!(speech_options(Some(&value)).is_err());
        }
    }
    #[test] fn checks_languages_voices_and_reference_transcript(){
        assert!(validate(&json!({"kind":"voice","engine":"kokoro","voice":"af_heart"}),"en","").is_ok());
        assert!(validate(&json!({"kind":"voice","engine":"kokoro","voice":"missing"}),"en","").is_err());
        assert!(validate(&json!({"kind":"voice","engine":"qwen3"}),"en","").is_err());
        assert!(validate(&json!({"kind":"voice","engine":"qwen3"}),"ar","Hello").is_err());
        assert!(validate(&json!({"kind":"voice","engine":"qwen3-hq"}),"en","").is_err());
        assert!(validate(&json!({"kind":"voice","engine":"qwen3-hq"}),"en","Exact words").is_ok());
    }
    #[test] fn atomically_claims_and_cancels_queued_takes(){
        let dir=tempfile::tempdir().unwrap();let store=Store::open(dir.path().into()).unwrap();
        store.update(|s|{s["jobs"]=json!([{"id":"j","provider":"local","status":"prepared"}]);Ok(())}).unwrap();
        let c=LocalTts::new(store.clone(),dir.path().into());c.claim("j").unwrap();assert!(c.claim("j").is_err());c.cancel("j").unwrap();assert_eq!(store.read()["jobs"][0]["status"],"cancelled");
    }
}
