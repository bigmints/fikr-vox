import test from 'node:test';
import assert from 'node:assert/strict';
import {voiceTraitsFromDescription,voiceTraitsInstruction,voiceTraitFields} from '../public/voice-design-form.js';

test('existing descriptions populate supported form choices',()=>{
 assert.deepEqual(voiceTraitsFromDescription('An adult woman with a very low pitch, deep voice. speaks faster. Casual conversational tone'),{gender:'female',age:'',pitch:'very low pitch',whisper:false,casual:true,accent:''});
 assert.deepEqual(voiceTraitsFromDescription('A mature male voice whispering with a British accent and a medium pitch.'),{gender:'male',age:'middle-aged',pitch:'moderate pitch',whisper:true,casual:false,accent:'british accent'});
});
test('form produces supported traits and includes accents only for English',()=>{
 const fields={gender:'female',age:'young adult',pitch:'low pitch',whisper:true,accent:'indian accent'};
 assert.equal(voiceTraitsInstruction(fields,'en'),'female, young adult, low pitch, whisper, indian accent');
 assert.equal(voiceTraitsInstruction(fields,'ml'),'female, young adult, low pitch, whisper');
 assert.equal(voiceTraitsInstruction({accent:'british accent'},'ml'),'');
 assert.equal(voiceTraitsInstruction({gender:'invented',pitch:'ultra high',age:'forever'},'en'),'');
 assert.equal(voiceTraitsInstruction({},'en'),'');
});
test('every selectable trait round trips without losing the chosen field',()=>{
 for(const field of voiceTraitFields)for(const [value] of field.choices){
  const description=voiceTraitsInstruction({[field.key]:value},'en');
  assert.equal(voiceTraitsFromDescription(description)[field.key],value);
 }
 assert.ok(voiceTraitsFromDescription(voiceTraitsInstruction({whisper:true},'en')).whisper);
});

test('casual tone serializes as explicitly experimental guidance',()=>{
 assert.equal(voiceTraitsInstruction({gender:'female',casual:true},'ml'),'female, casual conversational tone');
 assert.ok(voiceTraitsFromDescription('female, casual conversational tone').casual);
});
