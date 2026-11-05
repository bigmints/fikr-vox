export const workerAvatarPresets = [
  {id:'lightx2v-4',name:'Accelerated · 4 steps'},
  {id:'baseline',name:'Baseline · 8 steps'},
];

export function workerPreset(value='lightx2v-4') {
  if (!workerAvatarPresets.some(p=>p.id===value)) throw Object.assign(new Error('Choose a supported Worker avatar preset.'),{status:400});
  return value;
}

export function availableWorkerPresets(engine) {
  if (!Array.isArray(engine?.presets)) return workerAvatarPresets.filter(p=>p.id==='baseline');
  return workerAvatarPresets.filter(p=>engine.presets.some(e=>e.id===p.id&&e.ready===true));
}
