use crate::store::{now, text, uid, Result};
use serde_json::{json, Value};
use std::collections::HashMap;

fn busy(j: &Value) -> bool {
    [
        "submitting",
        "queued",
        "running",
        "cancel_requested",
        "waiting",
    ]
    .contains(&text(j, "status").as_str())
}
fn remap(v: &Value, ids: &HashMap<String, String>) -> Value {
    match v {
        Value::String(s) => json!(ids.get(s).unwrap_or(s)),
        Value::Array(a) => Value::Array(a.iter().map(|v| remap(v, ids)).collect()),
        Value::Object(o) => Value::Object(
            o.iter()
                .map(|(k, v)| (ids.get(k).unwrap_or(k).clone(), remap(v, ids)))
                .collect(),
        ),
        _ => v.clone(),
    }
}
pub fn apply(s: &mut Value, collection: &str, id: &str, operation: &str) -> Result<Value> {
    let item = s[collection]
        .as_array()
        .unwrap()
        .iter()
        .find(|x| x["id"] == id)
        .cloned()
        .ok_or("Project or model not found")?;
    if operation == "duplicate" {
        let mut copy = item.clone();
        if collection == "projects" {
            let jobs: Vec<Value> = s["jobs"]
                .as_array()
                .unwrap()
                .iter()
                .filter(|j| {
                    j["projectId"] == id
                        && j["status"] == "completed"
                        && !text(j, "outputId").is_empty()
                })
                .cloned()
                .collect();
            let mut ids = HashMap::from([(id.to_string(), uid())]);
            for sec in item["sections"].as_array().unwrap() {
                ids.insert(text(sec, "id"), uid());
            }
            for job in &jobs {
                ids.insert(text(job, "id"), uid());
            }
            for job in &jobs {
                let section = text(job, "sectionId");
                if !section.is_empty() {
                    ids.entry(section).or_insert_with(uid);
                }
            }
            copy = remap(&copy, &ids);
            copy["title"] = json!(format!("{} · copy", text(&item, "title")));
            for (i, sec) in copy["sections"]
                .as_array_mut()
                .unwrap()
                .iter_mut()
                .enumerate()
            {
                for key in ["pendingVoiceTakeId", "pendingVideoTakeId"] {
                    if !ids.contains_key(&text(&item["sections"][i], key)) {
                        sec.as_object_mut().unwrap().remove(key);
                    }
                }
            }
            for job in jobs {
                let mut cloned = remap(&job, &ids);
                cloned["projectTitle"] = copy["title"].clone();
                cloned["copiedFromJobId"] = if text(&job, "copiedFromJobId").is_empty() {
                    job["id"].clone()
                } else {
                    job["copiedFromJobId"].clone()
                };
                s["jobs"].as_array_mut().unwrap().push(cloned);
            }
        } else {
            copy["id"] = json!(uid());
            copy["name"] = json!(format!("{} · copy", text(&item, "name")));
        }
        copy["createdAt"] = json!(now());
        copy["updatedAt"] = copy["createdAt"].clone();
        s[collection]
            .as_array_mut()
            .unwrap()
            .insert(0, copy.clone());
        return Ok(copy);
    }
    if collection == "profiles" {
        if let Some(p) = s["projects"].as_array().unwrap().iter().find(|p| {
            p["profileId"] == id
                || p["podcast"]["speakers"]
                    .as_array()
                    .is_some_and(|a| a.iter().any(|x| x["profileId"] == id))
                || p["tracks"]
                    .as_array()
                    .is_some_and(|a| a.iter().any(|x| x["profileId"] == id))
        }) {
            return Err(format!(
                "This model is used by “{}”. Choose another model in that project before deleting.",
                text(p, "title")
            ));
        }
    }
    let key = if collection == "projects" {
        "projectId"
    } else {
        "profileId"
    };
    if s["jobs"]
        .as_array()
        .unwrap()
        .iter()
        .any(|j| j[key] == id && busy(j))
    {
        return Err(
            "Wait for queued or running jobs to finish, or cancel them before deleting.".into(),
        );
    }
    s["jobs"]
        .as_array_mut()
        .unwrap()
        .retain(|j| j[key] != id || j["status"] != "prepared");
    s[collection]
        .as_array_mut()
        .unwrap()
        .retain(|x| x["id"] != id);
    Ok(json!({"deleted":true}))
}

#[cfg(test)]
mod tests {
    use super::*;
    fn sample() -> Value {
        json!({"projects":[{"id":"p","title":"Episode","profileId":"t","sections":[{"id":"s","voiceTakeId":"j","pendingVoiceTakeId":"j","trims":{"j":{"start":0,"end":2}}},{"id":"split","sourceSectionId":"s","sourceTakeId":"j","audioAssetId":"audio"}]}],"profiles":[{"id":"t","name":"Voice","voiceAssetId":"reference","voiceDesign":{"text":"Warm"}}],"jobs":[{"id":"j","projectId":"p","sectionId":"s","profileId":"t","status":"completed","outputId":"audio","usage":{"cost":0.5}},{"id":"pending","projectId":"p","profileId":"t","status":"prepared"}],"assets":[{"id":"audio"}]})
    }
    #[test]
    fn duplicate_preserves_outputs_and_remaps_take_links() {
        let mut s = sample();
        let original = s["projects"][0].clone();
        let p = apply(&mut s, "projects", "p", "duplicate").unwrap();
        let job = s["jobs"]
            .as_array()
            .unwrap()
            .iter()
            .find(|j| j["projectId"] == p["id"])
            .unwrap();
        assert_ne!(p["id"], "p");
        assert_eq!(p["sections"][0]["voiceTakeId"], job["id"]);
        assert_eq!(p["sections"][0]["pendingVoiceTakeId"], job["id"]);
        assert_eq!(p["sections"][0]["trims"][text(job, "id")]["end"], 2);
        assert_eq!(p["sections"][1]["sourceSectionId"], p["sections"][0]["id"]);
        assert_eq!(p["sections"][1]["sourceTakeId"], job["id"]);
        assert_eq!(job["copiedFromJobId"], "j");
        assert_eq!(s["projects"][1], original);
        assert_eq!(s["assets"].as_array().unwrap().len(), 1);
    }
    #[test]
    fn deletion_protects_assignments_and_live_work() {
        for location in ["project", "speaker", "track"] {
            let mut s = sample();
            s["projects"][0]["profileId"] = json!("");
            match location {
                "project" => s["projects"][0]["profileId"] = json!("t"),
                "speaker" => s["projects"][0]["podcast"] = json!({"speakers":[{"profileId":"t"}]}),
                _ => s["projects"][0]["tracks"] = json!([{"profileId":"t"}]),
            }
            assert!(apply(&mut s, "profiles", "t", "delete")
                .unwrap_err()
                .contains("used by"));
        }
        for status in [
            "submitting",
            "queued",
            "running",
            "waiting",
            "cancel_requested",
        ] {
            let mut s = sample();
            s["jobs"][1]["status"] = json!(status);
            assert!(apply(&mut s, "projects", "p", "delete").is_err());
        }
        let mut s = sample();
        apply(&mut s, "projects", "p", "delete").unwrap();
        let copy = apply(&mut s, "profiles", "t", "duplicate").unwrap();
        assert_eq!(copy["voiceAssetId"], "reference");
        assert_ne!(copy["id"], "t");
        apply(&mut s, "profiles", "t", "delete").unwrap();
        assert_eq!(s["jobs"].as_array().unwrap().len(), 1);
        assert_eq!(s["assets"].as_array().unwrap().len(), 1);
        assert!(apply(&mut s, "projects", "missing", "duplicate").is_err());
    }
}
