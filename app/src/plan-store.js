// Preserve the original MVP key and id-array format for existing browser plans.
export const PLAN_KEY='reinvent-plan';
export function readPlan(storage,key=PLAN_KEY) {
  try {const raw=storage.getItem(key);if(!raw)return {ids:[],warning:''};const value=JSON.parse(raw);if(!Array.isArray(value))throw new Error('Invalid plan');return {ids:[...new Set(value.filter(id=>typeof id==='string'))],warning:''};}
  catch {return {ids:[],warning:'保存済みのMy Planを読み込めませんでした。この画面では新しく候補を整理できます。'};}
}
export function writePlan(storage,ids,key=PLAN_KEY) {
  try {storage.setItem(key,JSON.stringify(ids));return '';}
  catch {return 'ブラウザーに保存できませんでした。候補はこの画面を開いている間だけ保持されます。';}
}
