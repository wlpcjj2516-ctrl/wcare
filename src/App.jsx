import { useState, useRef, useEffect } from 'react'
import { supabase } from './supabase.js'

const WOUND_STATUS = [
  { value: 'healing', label: 'หายดี', color: '#22c55e' },
  { value: 'normal', label: 'ปกติ', color: '#3b82f6' },
  { value: 'inflamed', label: 'อักเสบ', color: '#f97316' },
  { value: 'infected', label: 'ติดเชื้อ', color: '#ef4444' },
  { value: 'dehiscence', label: 'แผลแยก', color: '#a855f7' },
]
const SITE_COLORS = ['#0ea5e9','#a78bfa','#34d399','#fb923c','#f472b6','#facc15']
const SHIFTS = [
  { v: 'morning',   l: '🌅 เวรเช้า',  bg: 'rgba(234,179,8,0.12)',  border: 'rgba(234,179,8,0.3)',  color: '#ca8a04' },
  { v: 'afternoon', l: '🌤️ เวรบ่าย', bg: 'rgba(14,165,233,0.12)', border: 'rgba(14,165,233,0.3)', color: '#0ea5e9' },
  { v: 'night',     l: '🌙 เวรดึก',   bg: 'rgba(99,102,241,0.12)', border: 'rgba(99,102,241,0.3)', color: '#818cf8' },
  { v: '',          l: 'ไม่ระบุเวร',  bg: 'rgba(255,255,255,0.04)',border: 'rgba(255,255,255,0.1)', color: '#64748b' },
]

function daysSince(d) { return Math.max(0, Math.floor((new Date() - new Date(d)) / 86400000)) }
function formatDate(d) { return new Date(d).toLocaleDateString('th-TH', { year:'numeric', month:'short', day:'numeric' }) }
function getStatus(val) { return WOUND_STATUS.find(s => s.value === val) || WOUND_STATUS[1] }
function sc(idx) { return SITE_COLORS[idx % SITE_COLORS.length] }

const css = `
@import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
::-webkit-scrollbar{width:5px}::-webkit-scrollbar-track{background:#1e293b}::-webkit-scrollbar-thumb{background:#334155;border-radius:3px}
.card{background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);border-radius:16px}
.hoverable{transition:border-color .2s,transform .15s;cursor:pointer}
.hoverable:hover{border-color:rgba(14,165,233,0.45)!important;transform:translateY(-1px)}
.btn{border:none;border-radius:10px;cursor:pointer;font-family:'Sarabun',sans-serif;font-size:14px;font-weight:600;padding:9px 18px;transition:all .2s}
.btn-blue{background:linear-gradient(135deg,#0ea5e9,#0284c7);color:#fff}
.btn-blue:hover{box-shadow:0 4px 14px rgba(14,165,233,.4);transform:translateY(-1px)}
.btn-blue:disabled{opacity:.4;cursor:not-allowed;transform:none!important}
.btn-ghost{background:rgba(255,255,255,0.07);color:#94a3b8;border:1px solid rgba(255,255,255,0.1)}
.btn-ghost:hover{background:rgba(255,255,255,0.13);color:#e2e8f0}
.badge{padding:3px 10px;border-radius:20px;font-size:12px;font-weight:600;display:inline-block}
input,textarea,select{background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);border-radius:10px;color:#e2e8f0;font-family:'Sarabun',sans-serif;font-size:14px;padding:10px 14px;width:100%;outline:none;transition:border .2s}
input:focus,textarea:focus,select:focus{border-color:#0ea5e9}
select option{background:#1e293b}
.upload-zone{border:2px dashed rgba(255,255,255,.14);border-radius:13px;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;overflow:hidden;transition:border .2s}
.upload-zone:hover{border-color:rgba(14,165,233,.5)}
.thumb{border-radius:10px;overflow:hidden;cursor:pointer;transition:all .2s;border:2px solid transparent}
.thumb:hover{transform:scale(1.03);border-color:#0ea5e9}
.thumb.sel-a{border-color:#0ea5e9!important;box-shadow:0 0 16px rgba(14,165,233,.4)}
.thumb.sel-b{border-color:#fb923c!important;box-shadow:0 0 16px rgba(249,115,22,.4)}
.lightbox{position:fixed;inset:0;background:rgba(0,0,0,.92);display:flex;align-items:center;justify-content:center;z-index:999;cursor:pointer}
.lightbox img{max-width:90vw;max-height:90vh;border-radius:12px}
.spinner{width:32px;height:32px;border:3px solid rgba(14,165,233,.3);border-top-color:#0ea5e9;border-radius:50%;animation:spin .8s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
`

const EMPTY_UPLOAD = { status: 'normal', note: '', date: new Date().toISOString().split('T')[0], shift: '' }
const EMPTY_P = { name: '', age: '', hn: '', bed: '', doctor: '', surgery: '', surgeryDate: '' }

export default function App() {
  // ── Auth ──
  const [user, setUser] = useState(null)
  const [loginForm, setLoginForm] = useState({ username: '', password: '' })
  const [loginErr, setLoginErr] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)

  // ── Data ──
  const [patients, setPatients] = useState([])
  const [woundSites, setWoundSites] = useState({})
  const [records, setRecords] = useState({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')

  // ── Navigation ──
  const [selPatient, setSelPatient] = useState(null)
  const [selSite, setSelSite] = useState(null)
  const [view, setView] = useState('list')

  // ── Forms ──
  const [patForm, setPatForm] = useState(EMPTY_P)
  const [editingPat, setEditingPat] = useState(null)
  const [confirmDelPat, setConfirmDelPat] = useState(null)
  const [siteForm, setSiteForm] = useState({ name: '', location: '' })
  const [editingSite, setEditingSite] = useState(null)
  const [editSiteForm, setEditSiteForm] = useState({ name: '', location: '' })
  const [uploadForm, setUploadForm] = useState(EMPTY_UPLOAD)
  const [uploadImgs, setUploadImgs] = useState([])
  const [editingRec, setEditingRec] = useState(null)
  const [editRecForm, setEditRecForm] = useState({ status: 'normal', note: '', date: '', shift: '', newImgUrl: null, newFile: null })
  const [confirmDelRec, setConfirmDelRec] = useState(null)
  const [compareMode, setCompareMode] = useState({ a: null, b: null })
  const [lightboxImg, setLightboxImg] = useState(null)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [exportImgs, setExportImgs] = useState([])
  const [showExport, setShowExport] = useState(false)
  const [showStorage, setShowStorage] = useState(false)
  const [storageStats, setStorageStats] = useState(null)

  const fileRef = useRef()
  const editFileRef = useRef()

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2500) }

  // ── Session ──
  useEffect(() => {
    const saved = sessionStorage.getItem('wcare_user')
    if (saved) { setUser(JSON.parse(saved)); loadAll() }
  }, [])

  // ── Login ──
  const handleLogin = async () => {
    if (!loginForm.username || !loginForm.password) { setLoginErr('กรุณากรอก Username และ Password'); return }
    setLoginLoading(true); setLoginErr('')
    try {
      const { data, error } = await supabase.from('users').select('*')
        .eq('username', loginForm.username.trim()).eq('password', loginForm.password).single()
      if (error || !data) { setLoginErr('Username หรือ Password ไม่ถูกต้อง') }
      else { setUser(data); sessionStorage.setItem('wcare_user', JSON.stringify(data)); await loadAll() }
    } catch { setLoginErr('เกิดข้อผิดพลาด กรุณาลองใหม่') }
    setLoginLoading(false)
  }

  const handleLogout = () => {
    setUser(null); sessionStorage.removeItem('wcare_user')
    setSelPatient(null); setSelSite(null); setView('list')
  }

  // ── Load data ──
  const loadAll = async () => {
    setLoading(true)
    try {
      const [{ data: pts }, { data: sites }, { data: recs }] = await Promise.all([
        supabase.from('patients').select('*').order('created_at'),
        supabase.from('wound_sites').select('*').order('created_at'),
        supabase.from('wound_records').select('*').order('created_at'),
      ])
      setPatients(pts || [])
      const sm = {}
      ;(sites || []).forEach(s => { if (!sm[s.patient_id]) sm[s.patient_id] = []; sm[s.patient_id].push({ id:s.id, patientId:s.patient_id, name:s.name, location:s.location }) })
      setWoundSites(sm)
      const rm = {}
      ;(recs || []).forEach(r => { if (!rm[r.site_id]) rm[r.site_id] = []; rm[r.site_id].push({ id:r.id, siteId:r.site_id, date:r.date, day:r.day, time:r.time, shift:r.shift, status:r.status, note:r.note, imageUrl:r.image_url }) })
      setRecords(rm)
    } catch(e) { console.error(e) }
    setLoading(false)
  }

  const patSites = selPatient ? (woundSites[selPatient.id] || []) : []
  const siteRecs = selSite ? (records[selSite.id] || []) : []

  // ── Patients ──
  const savePat = async () => {
    setSaving(true)
    const data = { name:patForm.name.trim(), age:Number(patForm.age)||0, hn:patForm.hn.trim(), bed:patForm.bed.trim(), doctor:patForm.doctor.trim(), surgery:patForm.surgery.trim(), surgery_date:patForm.surgeryDate||null }
    if (editingPat) await supabase.from('patients').update(data).eq('id', editingPat.id)
    else { data.id = `P${Date.now()}`; await supabase.from('patients').insert(data) }
    await loadAll(); setSaving(false); showToast('✅ บันทึกแล้ว'); setView('list')
  }

  const deletePat = async (p) => {
    setSaving(true)
    await supabase.from('patients').delete().eq('id', p.id)
    await loadAll(); setSaving(false); setConfirmDelPat(null); showToast('🗑️ ลบผู้ป่วยแล้ว')
  }

  // ── Sites ──
  const addSite = async () => {
    setSaving(true)
    await supabase.from('wound_sites').insert({ id:`site_${Date.now()}`, patient_id:selPatient.id, name:siteForm.name.trim(), location:siteForm.location.trim() })
    await loadAll(); setSaving(false); showToast('✅ เพิ่มตำแหน่งแผลแล้ว'); setSiteForm({ name:'', location:'' }); setView('patient')
  }

  const updateSite = async () => {
    setSaving(true)
    await supabase.from('wound_sites').update({ name:editSiteForm.name.trim(), location:editSiteForm.location.trim() }).eq('id', editingSite.id)
    await loadAll(); setSelSite(s => ({ ...s, name:editSiteForm.name.trim(), location:editSiteForm.location.trim() }))
    setSaving(false); showToast('✅ แก้ไขตำแหน่งแผลแล้ว'); setEditingSite(null); setView('site')
  }

  // ── Upload multiple images ──
  const handleImgsChange = (e) => {
    Array.from(e.target.files).forEach(file => {
      const reader = new FileReader()
      reader.onload = ev => setUploadImgs(prev => [...prev, { file, previewUrl: ev.target.result }])
      reader.readAsDataURL(file)
    })
    e.target.value = ''
  }

  const handleUpload = async () => {
    if (!uploadImgs.length) return
    setSaving(true)
    try {
      const recDate = uploadForm.date || new Date().toISOString().split('T')[0]
      const recDay = Math.max(0, Math.floor((new Date(recDate) - new Date(selPatient.surgery_date)) / 86400000))
      const now = new Date().toLocaleTimeString('th-TH', { hour:'2-digit', minute:'2-digit' })
      const rows = []
      for (let i = 0; i < uploadImgs.length; i++) {
        const { file } = uploadImgs[i]
        const ext = file.name.split('.').pop()
        const fn = `${selSite.id}/${Date.now()}_${i}.${ext}`
        const { error } = await supabase.storage.from('wound-images').upload(fn, file, { contentType: file.type })
        if (error) throw error
        const { data: urlData } = supabase.storage.from('wound-images').getPublicUrl(fn)
        rows.push({ id:Date.now()+i, site_id:selSite.id, date:recDate, day:recDay, time:now, shift:uploadForm.shift, status:uploadForm.status, note:i===0?uploadForm.note:'', image_url:urlData.publicUrl })
      }
      await supabase.from('wound_records').insert(rows)
      await loadAll(); showToast(`✅ บันทึก ${uploadImgs.length} ภาพแล้ว`)
      setUploadImgs([]); setUploadForm(EMPTY_UPLOAD); setView('site')
    } catch(e) { showToast('❌ บันทึกไม่สำเร็จ: ' + e.message) }
    setSaving(false)
  }

  // ── Edit record ──
  const handleEditImageChange = (e) => {
    const file = e.target.files[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setEditRecForm(f => ({ ...f, newImgUrl: ev.target.result, newFile: file }))
    reader.readAsDataURL(file)
  }

  const handleUpdateRec = async () => {
    setSaving(true)
    try {
      const recDate = editRecForm.date || editingRec.date
      const recDay = Math.max(0, Math.floor((new Date(recDate) - new Date(selPatient.surgery_date)) / 86400000))
      let imageUrl = editingRec.imageUrl
      if (editRecForm.newFile) {
        try { const op = editingRec.imageUrl.split('/wound-images/')[1]; if (op) await supabase.storage.from('wound-images').remove([op]) } catch {}
        const ext = editRecForm.newFile.name.split('.').pop()
        const fn = `${selSite.id}/${Date.now()}.${ext}`
        await supabase.storage.from('wound-images').upload(fn, editRecForm.newFile, { contentType: editRecForm.newFile.type })
        const { data: urlData } = supabase.storage.from('wound-images').getPublicUrl(fn)
        imageUrl = urlData.publicUrl
      }
      await supabase.from('wound_records').update({ status:editRecForm.status, note:editRecForm.note, date:recDate, day:recDay, shift:editRecForm.shift, image_url:imageUrl }).eq('id', editingRec.id)
      await loadAll(); showToast('✅ แก้ไขแล้ว')
    } catch(e) { showToast('❌ ' + e.message) }
    setSaving(false); setEditingRec(null)
  }

  const handleDeleteRec = async (rec) => {
    setSaving(true)
    try { const p = rec.imageUrl.split('/wound-images/')[1]; if (p) await supabase.storage.from('wound-images').remove([p]) } catch {}
    await supabase.from('wound_records').delete().eq('id', rec.id)
    await loadAll(); setSaving(false); setConfirmDelRec(null); showToast('🗑️ ลบภาพแล้ว')
  }

  // ── Export ──
  const buildDayImg = (date, dayRecs, patient, site, allRecs) => new Promise(resolve => {
    const PAD=20, COLS=Math.min(dayRecs.length,2), GAP=12, IMG_W=320, IMG_H=260, INFO_H=64
    const CELL_W=IMG_W, CELL_H=IMG_H+INFO_H, HEADER_H=80, FOOTER_H=36
    const W=PAD+COLS*(CELL_W+GAP)-GAP+PAD
    const ROWS=Math.ceil(dayRecs.length/COLS)
    const H=HEADER_H+ROWS*(CELL_H+GAP)-GAP+FOOTER_H+PAD
    const canvas=document.createElement('canvas'); canvas.width=W*2; canvas.height=H*2
    const ctx=canvas.getContext('2d'); ctx.scale(2,2)
    ctx.fillStyle='#f8fafc'; ctx.fillRect(0,0,W,H)
    ctx.fillStyle='#0f172a'; ctx.fillRect(0,0,W,HEADER_H)
    ctx.fillStyle='#38bdf8'; ctx.font='bold 14px sans-serif'; ctx.textAlign='left'
    ctx.fillText(patient.name, PAD, 26)
    ctx.fillStyle='#94a3b8'; ctx.font='13px sans-serif'
    ctx.fillText(`${site.name}${site.location?' · '+site.location:''}`, PAD, 46)
    ctx.fillStyle='#fff'; ctx.font='bold 16px sans-serif'
    ctx.fillText(`POD ${dayRecs[0].day}  ·  ${formatDate(date)}`, PAD, 68)
    ctx.fillStyle='#64748b'; ctx.font='12px sans-serif'; ctx.textAlign='right'
    ctx.fillText(`${dayRecs.length} ภาพ`, W-PAD, 68)
    Promise.all(dayRecs.map((rec,i) => new Promise(r2 => {
      const col=i%COLS, row=Math.floor(i/COLS)
      const x=PAD+col*(CELL_W+GAP), y=HEADER_H+GAP/2+row*(CELL_H+GAP)
      const pNum=allRecs?allRecs.findIndex(r=>r.id===rec.id)+1:i+1
      ctx.fillStyle='#e2e8f0'; ctx.fillRect(x+2,y+2,CELL_W,CELL_H)
      ctx.fillStyle='#fff'; ctx.fillRect(x,y,CELL_W,CELL_H)
      const img=new Image(); img.crossOrigin='anonymous'
      img.onload=()=>{
        ctx.save(); ctx.rect(x,y,CELL_W,IMG_H); ctx.clip(); ctx.drawImage(img,x,y,CELL_W,IMG_H); ctx.restore()
        ctx.fillStyle='rgba(15,23,42,0.75)'; ctx.fillRect(x+6,y+6,72,22)
        ctx.fillStyle='#fff'; ctx.font='bold 11px sans-serif'; ctx.textAlign='left'
        ctx.fillText(`ภาพที่ ${pNum}`, x+10, y+21)
        ctx.fillStyle='rgba(0,0,0,0.55)'; ctx.fillRect(x,y+IMG_H-24,80,24)
        ctx.fillStyle='#fff'; ctx.fillText(`🕐 ${rec.time||'--:--'}`, x+6, y+IMG_H-8)
        const st=getStatus(rec.status)
        ctx.fillStyle=st.color+'22'; ctx.fillRect(x,y+IMG_H,CELL_W,28)
        ctx.fillStyle=st.color; ctx.font='bold 12px sans-serif'; ctx.textAlign='center'
        ctx.fillText(st.label, x+CELL_W/2, y+IMG_H+19)
        if(rec.note){ctx.fillStyle='#475569';ctx.font='11px sans-serif';ctx.textAlign='left';ctx.fillText(rec.note.substring(0,42),x+6,y+CELL_H-6)}
        r2()
      }; img.onerror=()=>r2(); img.src=rec.imageUrl
    }))).then(()=>{
      ctx.fillStyle='#e2e8f0'; ctx.fillRect(0,H-FOOTER_H,W,FOOTER_H)
      ctx.fillStyle='#94a3b8'; ctx.font='10px sans-serif'; ctx.textAlign='center'
      ctx.fillText(`W-CARE · Wound Care Tracker · Bueng Kan Hospital`, W/2, H-FOOTER_H+22)
      resolve(canvas.toDataURL('image/jpeg',0.92))
    })
  })

  const handleExport = async (ids) => {
    const recsToUse = ids ? siteRecs.filter(r=>ids.has(r.id)) : siteRecs
    if (!recsToUse.length) return
    setSelectMode(false); setSelectedIds(new Set()); setShowExport(true); setExportImgs([])
    const grouped = {}
    recsToUse.forEach(r => { if (!grouped[r.date]) grouped[r.date]=[]; grouped[r.date].push(r) })
    for (const date of Object.keys(grouped).sort()) {
      const img = await buildDayImg(date, grouped[date], selPatient, selSite, siteRecs)
      setExportImgs(prev => [...prev, { date, pod:grouped[date][0].day, url:img }])
    }
  }

  const mergeAndDownload = async (images) => {
    const loaded = await Promise.all(images.map(item => new Promise(res => {
      const img=new Image(); img.onload=()=>res({img,item}); img.onerror=()=>res(null); img.src=item.url
    })))
    const valid = loaded.filter(Boolean)
    if (!valid.length) return
    const W=valid[0].img.width, GAP=20
    const totalH = valid.reduce((h,{img})=>h+img.height+GAP,0)-GAP
    const canvas=document.createElement('canvas'); canvas.width=W; canvas.height=totalH
    const ctx=canvas.getContext('2d'); ctx.fillStyle='#f1f5f9'; ctx.fillRect(0,0,W,totalH)
    let y=0; valid.forEach(({img})=>{ ctx.drawImage(img,0,y,W,img.height); y+=img.height+GAP })
    const a=document.createElement('a'); a.href=canvas.toDataURL('image/jpeg',0.92)
    a.download=`wound_${selPatient?.name}_${selSite?.name}_${new Date().toISOString().split('T')[0]}.jpg`
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
  }

  const fetchStorageStats = async () => {
    setShowStorage(true); setStorageStats(null)
    try {
      const [{ count:patCount},{count:siteCount},{count:recCount}] = await Promise.all([
        supabase.from('patients').select('*',{count:'exact',head:true}),
        supabase.from('wound_sites').select('*',{count:'exact',head:true}),
        supabase.from('wound_records').select('*',{count:'exact',head:true}),
      ])
      const estImgMB=((recCount||0)*350)/1024, maxImgMB=1024
      const imgPct=Math.min(100,(estImgMB/maxImgMB)*100)
      setStorageStats({ patients:patCount||0, sites:siteCount||0, records:recCount||0, estImgMB:estImgMB.toFixed(1), maxImgMB, imgPct:imgPct.toFixed(1), remaining:Math.floor((maxImgMB-estImgMB)/0.35) })
    } catch(e) { setStorageStats({ error:e.message }) }
  }

  // ══════════════════════════════════════════
  // RENDER — LOGIN
  // ══════════════════════════════════════════
  if (!user) return (
    <div style={{ minHeight:'100vh', background:'linear-gradient(135deg,#0f172a,#1e293b,#0f2744)', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Sarabun,sans-serif', padding:20 }}>
      <style>{css}</style>
      <div style={{ width:'100%', maxWidth:400 }}>
        <div style={{ textAlign:'center', marginBottom:32 }}>
          <div style={{ fontSize:64, marginBottom:12 }}>🩹</div>
          <div style={{ fontSize:26, fontWeight:800, color:'#e2e8f0', letterSpacing:1 }}>W-CARE</div>
          <div style={{ fontSize:13, color:'#64748b', marginTop:4 }}>ระบบติดตามแผลผ่าตัด · โรงพยาบาลบึงกาฬ</div>
        </div>
        <div className="card" style={{ padding:'32px 28px' }}>
          <div style={{ fontWeight:700, fontSize:18, marginBottom:4, color:'#e2e8f0' }}>เข้าสู่ระบบ</div>
          <div style={{ fontSize:13, color:'#64748b', marginBottom:24 }}>กรุณาเข้าสู่ระบบก่อนใช้งาน</div>
          <div style={{ marginBottom:14 }}>
            <label style={{ fontSize:13, color:'#94a3b8', marginBottom:7, display:'block' }}>Username</label>
            <input placeholder="Username" value={loginForm.username} onChange={e=>setLoginForm(f=>({...f,username:e.target.value}))} onKeyDown={e=>e.key==='Enter'&&handleLogin()} />
          </div>
          <div style={{ marginBottom:20 }}>
            <label style={{ fontSize:13, color:'#94a3b8', marginBottom:7, display:'block' }}>Password</label>
            <input type="password" placeholder="Password" value={loginForm.password} onChange={e=>setLoginForm(f=>({...f,password:e.target.value}))} onKeyDown={e=>e.key==='Enter'&&handleLogin()} />
          </div>
          {loginErr && <div style={{ background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.25)', borderRadius:10, padding:'10px 14px', marginBottom:16, fontSize:13, color:'#f87171' }}>❌ {loginErr}</div>}
          <button className="btn btn-blue" style={{ width:'100%', padding:'12px 0', fontSize:15 }} onClick={handleLogin} disabled={loginLoading}>
            {loginLoading ? '⏳ กำลังเข้าสู่ระบบ...' : '🔐 เข้าสู่ระบบ'}
          </button>
          <div style={{ marginTop:18, padding:'12px 14px', background:'rgba(14,165,233,0.06)', border:'1px solid rgba(14,165,233,0.15)', borderRadius:10, fontSize:12, color:'#64748b', lineHeight:1.8 }}>
            🔒 ระบบนี้จัดเก็บข้อมูลผู้ป่วยภายใต้มาตรการ PDPA<br/>การเข้าถึงจำกัดเฉพาะบุคลากรที่ได้รับอนุญาต
          </div>
        </div>
      </div>
    </div>
  )

  if (loading) return (
    <div style={{ minHeight:'100vh', background:'linear-gradient(135deg,#0f172a,#1e293b)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:16, color:'#94a3b8', fontFamily:'Sarabun,sans-serif' }}>
      <style>{css}</style>
      <div className="spinner"/><div>กำลังโหลดข้อมูล...</div>
    </div>
  )

  // ══════════════════════════════════════════
  // RENDER — MAIN APP
  // ══════════════════════════════════════════
  return (
    <div style={{ minHeight:'100vh', background:'linear-gradient(135deg,#0f172a 0%,#1e293b 60%,#0f2744 100%)', fontFamily:'Sarabun,sans-serif', color:'#e2e8f0' }}>
      <style>{css}</style>

      {/* HEADER */}
      <div style={{ background:'rgba(0,0,0,.3)', borderBottom:'1px solid rgba(255,255,255,.06)', padding:'12px 16px', display:'flex', alignItems:'center', gap:12, flexWrap:'wrap', position:'sticky', top:0, zIndex:100 }}>
        <div style={{ width:36,height:36,borderRadius:10,background:'linear-gradient(135deg,#0ea5e9,#6366f1)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,flexShrink:0 }}>🩹</div>
        <div>
          <div style={{ fontWeight:700,fontSize:16 }}>W-CARE</div>
          <div style={{ fontSize:10,color:'#64748b' }}>ระบบติดตามแผลผ่าตัด · Bueng Kan Hospital</div>
        </div>
        {saving && <div style={{ fontSize:12,color:'#94a3b8' }}>⏳ กำลังบันทึก...</div>}
        <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
          <button className="btn btn-ghost" style={{ padding:'5px 10px',fontSize:12 }} onClick={()=>{ setSelPatient(null);setSelSite(null);setView('list') }}>🏠</button>
          {selPatient && <><span style={{ color:'#334155' }}>›</span>
            <button className="btn btn-ghost" style={{ padding:'5px 10px',fontSize:12 }} onClick={()=>{ setSelSite(null);setView('patient') }}>{selPatient.name.split(' ')[0]}</button></>}
          {selSite && <><span style={{ color:'#334155' }}>›</span>
            <span style={{ color:'#e2e8f0',fontWeight:600,fontSize:12 }}>{selSite.name.length>8?selSite.name.substring(0,8)+'...':selSite.name}</span></>}
          <button className="btn btn-ghost" style={{ padding:'5px 10px',fontSize:12,color:'#34d399' }} onClick={fetchStorageStats}>💾</button>
          <div style={{ display:'flex',alignItems:'center',gap:6,background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:8,padding:'4px 10px' }}>
            <span style={{ fontSize:12,color:'#94a3b8' }}>👤 {user?.name}</span>
            <button className="btn btn-ghost" style={{ fontSize:11,padding:'2px 8px',color:'#f87171',borderColor:'rgba(239,68,68,.25)' }} onClick={handleLogout}>ออก</button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth:1100, margin:'0 auto', padding:'18px 16px' }}>

        {/* LIST */}
        {view==='list' && (
          <div>
            <div style={{ marginBottom:16,display:'flex',justifyContent:'space-between',alignItems:'center' }}>
              <h2 style={{ fontSize:18,fontWeight:700 }}>รายชื่อผู้ป่วย</h2>
              <button className="btn btn-blue" style={{ padding:'8px 16px',fontSize:13 }} onClick={()=>{ setPatForm(EMPTY_P);setEditingPat(null);setView('editPat') }}>+ เพิ่มผู้ป่วย</button>
            </div>
            {patients.length===0 ? (
              <div className="card" style={{ padding:52,textAlign:'center',color:'#475569' }}>
                <div style={{ fontSize:40,marginBottom:12 }}>👥</div>
                <div style={{ fontSize:15,fontWeight:600 }}>ยังไม่มีผู้ป่วย</div>
                <div style={{ fontSize:13,marginTop:8 }}>กด "+ เพิ่มผู้ป่วย" เพื่อเริ่มต้น</div>
              </div>
            ) : (
              <div style={{ display:'grid',gap:12 }}>
                {patients.map(p => {
                  const sites=woundSites[p.id]||[], pics=sites.reduce((n,s)=>n+(records[s.id]||[]).length,0)
                  return (
                    <div key={p.id} className="card hoverable" style={{ padding:'14px 18px' }} onClick={()=>{ setSelPatient(p);setSelSite(null);setView('patient') }}>
                      <div style={{ display:'flex',alignItems:'center',gap:12 }}>
                        <div style={{ width:44,height:44,borderRadius:12,background:'linear-gradient(135deg,#1e3a5f,#1e40af)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:20,flexShrink:0 }}>
                          {p.name.startsWith('นางสาว')?'👧':p.name.startsWith('นาง')?'👩':'👨'}
                        </div>
                        <div style={{ flex:1 }}>
                          <div style={{ fontWeight:700,fontSize:15 }}>{p.name}</div>
                          <div style={{ fontSize:12,color:'#94a3b8',marginTop:2 }}>HN: {p.hn} · อายุ {p.age} ปี{p.bed?` · เตียง ${p.bed}`:''}</div>
                          {p.doctor && <div style={{ fontSize:12,color:'#64748b',marginTop:1 }}>👨‍⚕️ {p.doctor}</div>}
                          <div style={{ fontSize:12,color:'#64748b',marginTop:1 }}>🔪 {p.surgery} · {formatDate(p.surgery_date)}</div>
                        </div>
                        <div style={{ display:'flex',flexDirection:'column',alignItems:'flex-end',gap:4,flexShrink:0 }}>
                          <div style={{ fontSize:13,color:'#0ea5e9',fontWeight:700 }}>POD {daysSince(p.surgery_date)}</div>
                          <div style={{ fontSize:12,color:'#64748b' }}>{sites.length} ตำแหน่ง · {pics} ภาพ</div>
                          <div style={{ display:'flex',gap:5 }}>
                            <button className="btn btn-ghost" style={{ fontSize:11,padding:'3px 9px' }} onClick={e=>{ e.stopPropagation();setPatForm({name:p.name,age:String(p.age),hn:p.hn||'',bed:p.bed||'',doctor:p.doctor||'',surgery:p.surgery||'',surgeryDate:p.surgery_date||''});setEditingPat(p);setView('editPat') }}>✏️</button>
                            <button className="btn btn-ghost" style={{ fontSize:11,padding:'3px 9px',color:'#f87171',borderColor:'rgba(239,68,68,.25)' }} onClick={e=>{ e.stopPropagation();setConfirmDelPat(p) }}>🗑️</button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* EDIT PATIENT */}
        {view==='editPat' && (
          <div style={{ maxWidth:500,margin:'0 auto' }}>
            <div className="card" style={{ padding:'26px 24px' }}>
              <div style={{ fontWeight:700,fontSize:17,marginBottom:20 }}>{editingPat?'✏️ แก้ไขข้อมูลผู้ป่วย':'🏥 เพิ่มผู้ป่วยใหม่'}</div>
              <div style={{ display:'grid',gap:13 }}>
                <div><label style={{ fontSize:13,color:'#94a3b8',marginBottom:7,display:'block' }}>ชื่อ-นามสกุล *</label>
                  <input placeholder="เช่น นายสมชาย ใจดี" value={patForm.name} onChange={e=>setPatForm(f=>({...f,name:e.target.value}))} /></div>
                <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:12 }}>
                  <div><label style={{ fontSize:13,color:'#94a3b8',marginBottom:7,display:'block' }}>เตียง</label>
                    <input placeholder="เช่น 1, 2A" value={patForm.bed} onChange={e=>setPatForm(f=>({...f,bed:e.target.value}))} /></div>
                  <div><label style={{ fontSize:13,color:'#94a3b8',marginBottom:7,display:'block' }}>แพทย์ผู้ดูแล</label>
                    <input placeholder="เช่น นพ.สมชาย" value={patForm.doctor} onChange={e=>setPatForm(f=>({...f,doctor:e.target.value}))} /></div>
                </div>
                <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:12 }}>
                  <div><label style={{ fontSize:13,color:'#94a3b8',marginBottom:7,display:'block' }}>อายุ (ปี)</label>
                    <input type="number" placeholder="45" value={patForm.age} onChange={e=>setPatForm(f=>({...f,age:e.target.value}))} /></div>
                  <div><label style={{ fontSize:13,color:'#94a3b8',marginBottom:7,display:'block' }}>HN</label>
                    <input placeholder="12345" value={patForm.hn} onChange={e=>setPatForm(f=>({...f,hn:e.target.value}))} /></div>
                </div>
                <div><label style={{ fontSize:13,color:'#94a3b8',marginBottom:7,display:'block' }}>การผ่าตัด</label>
                  <input placeholder="เช่น ผ่าตัดไส้ติ่ง" value={patForm.surgery} onChange={e=>setPatForm(f=>({...f,surgery:e.target.value}))} /></div>
                <div><label style={{ fontSize:13,color:'#94a3b8',marginBottom:7,display:'block' }}>วันที่ผ่าตัด *</label>
                  <input type="date" value={patForm.surgeryDate} onChange={e=>setPatForm(f=>({...f,surgeryDate:e.target.value}))} /></div>
              </div>
              <div style={{ display:'flex',gap:11,marginTop:22 }}>
                <button className="btn btn-blue" style={{ flex:1 }} disabled={!patForm.name.trim()||!patForm.surgeryDate||saving} onClick={savePat}>{saving?'⏳...':editingPat?'บันทึกการแก้ไข':'เพิ่มผู้ป่วย'}</button>
                <button className="btn btn-ghost" onClick={()=>setView(editingPat?'patient':'list')}>ยกเลิก</button>
              </div>
            </div>
          </div>
        )}

        {/* PATIENT */}
        {view==='patient' && selPatient && (
          <div>
            <div className="card" style={{ padding:'15px 18px',marginBottom:18 }}>
              <div style={{ display:'flex',alignItems:'flex-start',gap:12,flexWrap:'wrap' }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:700,fontSize:17 }}>{selPatient.name}</div>
                  <div style={{ fontSize:12,color:'#94a3b8',marginTop:3 }}>HN: {selPatient.hn} · อายุ {selPatient.age} ปี{selPatient.bed?` · เตียง ${selPatient.bed}`:''}</div>
                  {selPatient.doctor && <div style={{ fontSize:12,color:'#64748b',marginTop:1 }}>👨‍⚕️ {selPatient.doctor}</div>}
                  <div style={{ fontSize:12,color:'#64748b',marginTop:1 }}>🔪 {selPatient.surgery} · {formatDate(selPatient.surgery_date)} · <strong style={{ color:'#0ea5e9' }}>POD {daysSince(selPatient.surgery_date)}</strong></div>
                </div>
                <button className="btn btn-blue" onClick={()=>{ setSiteForm({name:'',location:''});setView('addSite') }}>+ เพิ่มตำแหน่งแผล</button>
              </div>
            </div>
            {patSites.length===0 ? (
              <div className="card" style={{ padding:52,textAlign:'center',color:'#475569' }}>
                <div style={{ fontSize:40,marginBottom:12 }}>📍</div>
                <div style={{ fontSize:15,fontWeight:600 }}>ยังไม่มีตำแหน่งแผล</div>
              </div>
            ) : (
              <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))',gap:14 }}>
                {patSites.map((site,idx) => {
                  const recs=records[site.id]||[], latest=recs[recs.length-1], color=sc(idx)
                  return (
                    <div key={site.id} className="card hoverable" style={{ overflow:'hidden' }} onClick={()=>{ setSelSite(site);setCompareMode({a:null,b:null});setView('site') }}>
                      <div style={{ height:130,background:latest?'none':`linear-gradient(135deg,${color}18,${color}08)`,position:'relative',overflow:'hidden' }}>
                        {latest?<img src={latest.imageUrl} alt="" style={{ width:'100%',height:'100%',objectFit:'cover' }}/>:
                          <div style={{ display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'100%',color,opacity:.45 }}><div style={{ fontSize:28 }}>📷</div><div style={{ fontSize:12,marginTop:4 }}>ยังไม่มีภาพ</div></div>}
                        <div style={{ position:'absolute',top:8,left:8 }}><span style={{ background:color,color:'#fff',borderRadius:7,padding:'2px 9px',fontSize:12,fontWeight:700 }}>{site.name}</span></div>
                        {latest && <div style={{ position:'absolute',bottom:8,right:8 }}><span className="badge" style={{ background:getStatus(latest.status).color+'cc',color:'#fff' }}>{getStatus(latest.status).label}</span></div>}
                      </div>
                      <div style={{ padding:'10px 13px' }}>
                        {site.location && <div style={{ fontSize:12,color:'#64748b',marginBottom:3 }}>📍 {site.location}</div>}
                        <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center' }}>
                          <span style={{ fontSize:12,color:'#94a3b8' }}>{recs.length} ภาพ</span>
                          {latest && <span style={{ fontSize:12,color:'#64748b' }}>POD {latest.day}</span>}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ADD SITE */}
        {view==='addSite' && selPatient && (
          <div style={{ maxWidth:460,margin:'0 auto' }}>
            <div className="card" style={{ padding:'24px 22px' }}>
              <div style={{ fontWeight:700,fontSize:17,marginBottom:18 }}>📍 เพิ่มตำแหน่งแผลใหม่</div>
              <div style={{ marginBottom:13 }}><label style={{ fontSize:13,color:'#94a3b8',marginBottom:7,display:'block' }}>ชื่อตำแหน่งแผล *</label>
                <input placeholder="เช่น แผลหน้าท้อง, trocar site 1..." value={siteForm.name} onChange={e=>setSiteForm(f=>({...f,name:e.target.value}))} /></div>
              <div style={{ marginBottom:22 }}><label style={{ fontSize:13,color:'#94a3b8',marginBottom:7,display:'block' }}>ตำแหน่งกายวิภาค</label>
                <input placeholder="เช่น RLQ, epigastric..." value={siteForm.location} onChange={e=>setSiteForm(f=>({...f,location:e.target.value}))} /></div>
              <div style={{ display:'flex',gap:11 }}>
                <button className="btn btn-blue" style={{ flex:1 }} disabled={!siteForm.name.trim()||saving} onClick={addSite}>{saving?'⏳...':'เพิ่มตำแหน่งแผล'}</button>
                <button className="btn btn-ghost" onClick={()=>setView('patient')}>ยกเลิก</button>
              </div>
            </div>
          </div>
        )}

        {/* EDIT SITE */}
        {view==='editSite' && editingSite && (
          <div style={{ maxWidth:460,margin:'0 auto' }}>
            <div className="card" style={{ padding:'24px 22px' }}>
              <div style={{ fontWeight:700,fontSize:17,marginBottom:18 }}>✏️ แก้ไขตำแหน่งแผล</div>
              <div style={{ marginBottom:13 }}><label style={{ fontSize:13,color:'#94a3b8',marginBottom:7,display:'block' }}>ชื่อตำแหน่งแผล *</label>
                <input value={editSiteForm.name} onChange={e=>setEditSiteForm(f=>({...f,name:e.target.value}))} /></div>
              <div style={{ marginBottom:22 }}><label style={{ fontSize:13,color:'#94a3b8',marginBottom:7,display:'block' }}>ตำแหน่งกายวิภาค</label>
                <input value={editSiteForm.location} onChange={e=>setEditSiteForm(f=>({...f,location:e.target.value}))} /></div>
              <div style={{ display:'flex',gap:11 }}>
                <button className="btn btn-blue" style={{ flex:1 }} disabled={!editSiteForm.name.trim()||saving} onClick={updateSite}>{saving?'⏳...':'บันทึก'}</button>
                <button className="btn btn-ghost" onClick={()=>{ setEditingSite(null);setView('site') }}>ยกเลิก</button>
              </div>
            </div>
          </div>
        )}

        {/* SITE */}
        {view==='site' && selSite && selPatient && (
          <div>
            {(()=>{ const idx=patSites.findIndex(s=>s.id===selSite.id), color=sc(idx); return (
              <div className="card" style={{ padding:'14px 18px',marginBottom:18,borderLeft:`4px solid ${color}` }}>
                <div style={{ display:'flex',alignItems:'center',gap:12,flexWrap:'wrap' }}>
                  <div style={{ flex:1 }}>
                    <div style={{ display:'flex',alignItems:'center',gap:8,flexWrap:'wrap' }}>
                      <span style={{ background:color,color:'#fff',borderRadius:7,padding:'3px 11px',fontSize:14,fontWeight:700 }}>{selSite.name}</span>
                      {selSite.location && <span style={{ fontSize:13,color:'#64748b' }}>📍 {selSite.location}</span>}
                      <button className="btn btn-ghost" style={{ fontSize:11,padding:'2px 9px' }} onClick={()=>{ setEditSiteForm({name:selSite.name,location:selSite.location||''});setEditingSite(selSite);setView('editSite') }}>✏️ แก้ไขตำแหน่ง</button>
                    </div>
                    <div style={{ fontSize:12,color:'#64748b',marginTop:5 }}>{selPatient.name} · {siteRecs.length} ภาพ</div>
                  </div>
                  <div style={{ display:'flex',gap:8,flexWrap:'wrap' }}>
                    <button className="btn btn-blue" onClick={()=>{ setUploadImgs([]);setUploadForm(EMPTY_UPLOAD);setView('upload') }}>+ บันทึกภาพวันนี้</button>
                    {siteRecs.length>=2 && <button className="btn btn-ghost" onClick={()=>{ setCompareMode({a:null,b:null});setView('compare') }}>🔍 เปรียบเทียบ</button>}
                    {siteRecs.length>0 && !selectMode && <button className="btn btn-ghost" style={{ color:'#34d399' }} onClick={()=>{ setSelectMode(true);setSelectedIds(new Set()) }}>📤 ส่งออก</button>}
                    {selectMode && <>
                      <button className="btn btn-ghost" style={{ fontSize:12 }} onClick={()=>selectedIds.size===siteRecs.length?setSelectedIds(new Set()):setSelectedIds(new Set(siteRecs.map(r=>r.id)))}>
                        {selectedIds.size===siteRecs.length?'ยกเลิกทั้งหมด':'เลือกทั้งหมด'}
                      </button>
                      <button className="btn btn-blue" disabled={selectedIds.size===0} onClick={()=>handleExport(selectedIds)}>ส่งออก ({selectedIds.size})</button>
                      <button className="btn btn-ghost" onClick={()=>{ setSelectMode(false);setSelectedIds(new Set()) }}>ยกเลิก</button>
                    </>}
                  </div>
                </div>
              </div>
            )})()}

            {siteRecs.length===0 ? (
              <div className="card" style={{ padding:52,textAlign:'center',color:'#475569' }}>
                <div style={{ fontSize:38,marginBottom:12 }}>📷</div>
                <div style={{ fontSize:15,fontWeight:600 }}>ยังไม่มีภาพแผล</div>
              </div>
            ) : (()=>{
              const grouped={}
              siteRecs.forEach(r=>{ if(!grouped[r.date])grouped[r.date]=[]; grouped[r.date].push(r) })
              const SHIFT_ORDER=['morning','afternoon','night','']
              return (
                <div style={{ display:'flex',flexDirection:'column',gap:24 }}>
                  {Object.keys(grouped).sort((a,b)=>b.localeCompare(a)).map(date=>{
                    const dayRecs=grouped[date]
                    const byShift={}; dayRecs.forEach(r=>{ const k=r.shift||''; if(!byShift[k])byShift[k]=[]; byShift[k].push(r) })
                    return (
                      <div key={date}>
                        <div style={{ display:'flex',alignItems:'center',gap:10,marginBottom:14 }}>
                          <div style={{ background:'linear-gradient(135deg,#0ea5e9,#6366f1)',borderRadius:9,padding:'5px 13px',fontWeight:700,fontSize:13 }}>POD {dayRecs[0].day}</div>
                          <div style={{ fontWeight:700,fontSize:14 }}>{formatDate(date)}</div>
                          <div style={{ flex:1,height:1,background:'rgba(255,255,255,0.08)' }}/>
                          <div style={{ fontSize:12,color:'#64748b' }}>{dayRecs.length} ภาพ</div>
                        </div>
                        <div style={{ display:'flex',flexDirection:'column',gap:12 }}>
                          {SHIFT_ORDER.filter(sh=>byShift[sh]?.length>0).map(sh=>{
                            const si=SHIFTS.find(s=>s.v===sh)||SHIFTS[3], shiftRecs=byShift[sh]
                            return (
                              <div key={sh} style={{ border:`1px solid ${si.border}`,borderRadius:12,overflow:'hidden' }}>
                                <div style={{ background:si.bg,padding:'7px 13px',display:'flex',alignItems:'center',justifyContent:'space-between' }}>
                                  <span style={{ fontWeight:700,fontSize:13,color:si.color }}>{si.l}</span>
                                  <span style={{ fontSize:12,color:'#64748b' }}>{shiftRecs.length} ภาพ</span>
                                </div>
                                <div style={{ padding:'11px',display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(170px,1fr))',gap:10 }}>
                                  {shiftRecs.map(rec=>{
                                    const isChosen=selectedIds.has(rec.id), pNum=siteRecs.findIndex(r=>r.id===rec.id)+1
                                    return (
                                      <div key={rec.id} className="card" style={{ overflow:'hidden',border:isChosen?'2px solid #0ea5e9':'2px solid transparent',transition:'border .15s' }}
                                        onClick={()=>selectMode?(isChosen?setSelectedIds(s=>{const n=new Set(s);n.delete(rec.id);return n}):setSelectedIds(s=>new Set([...s,rec.id]))):setLightboxImg(rec.imageUrl)}>
                                        <div style={{ position:'relative' }}>
                                          <img src={rec.imageUrl} alt="wound" style={{ width:'100%',height:135,objectFit:'cover',display:'block',cursor:'pointer',opacity:selectMode&&!isChosen?.6:1 }}/>
                                          <div style={{ position:'absolute',top:6,left:6,background:'rgba(15,23,42,0.8)',borderRadius:5,padding:'1px 7px',fontSize:11,color:'#fff',fontWeight:700 }}>ภาพที่ {pNum}</div>
                                          <div style={{ position:'absolute',bottom:6,left:6,background:'rgba(0,0,0,0.65)',borderRadius:5,padding:'1px 7px',fontSize:11,color:'#fff',fontWeight:600 }}>🕐 {rec.time||'--:--'}</div>
                                          {selectMode && <div style={{ position:'absolute',top:6,right:6,width:24,height:24,borderRadius:'50%',background:isChosen?'#0ea5e9':'rgba(0,0,0,0.4)',border:'2px solid '+(isChosen?'#0ea5e9':'#fff'),display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,color:'#fff',fontWeight:700 }}>{isChosen?'✓':''}</div>}
                                        </div>
                                        <div style={{ padding:'8px 10px' }}>
                                          <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center' }}>
                                            <span className="badge" style={{ background:getStatus(rec.status).color+'22',color:getStatus(rec.status).color }}>{getStatus(rec.status).label}</span>
                                            {!selectMode && <div style={{ display:'flex',gap:4 }}>
                                              <button className="btn btn-ghost" style={{ fontSize:10,padding:'1px 7px' }} onClick={e=>{ e.stopPropagation();setEditRecForm({status:rec.status,note:rec.note||'',date:rec.date,shift:rec.shift||'',newImgUrl:null,newFile:null});setEditingRec(rec) }}>✏️</button>
                                              <button className="btn btn-ghost" style={{ fontSize:10,padding:'1px 7px',color:'#f87171',borderColor:'rgba(239,68,68,.25)' }} onClick={e=>{ e.stopPropagation();setConfirmDelRec(rec) }}>🗑️</button>
                                            </div>}
                                          </div>
                                          {rec.note && <div style={{ fontSize:11,color:'#94a3b8',marginTop:4,lineHeight:1.4 }}>{rec.note}</div>}
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })()}
          </div>
        )}

        {/* UPLOAD */}
        {view==='upload' && selSite && selPatient && (
          <div style={{ maxWidth:560,margin:'0 auto' }}>
            <div className="card" style={{ padding:'22px 22px' }}>
              <div style={{ fontWeight:700,fontSize:17,marginBottom:4 }}>📸 บันทึกภาพแผล</div>
              <div style={{ fontSize:13,color:'#94a3b8',marginBottom:2 }}>{selPatient.name} · <strong>{selSite.name}</strong></div>
              <div style={{ fontSize:12,color:'#64748b',marginBottom:14 }}>POD {daysSince(selPatient.surgery_date)}{selPatient.bed?` · เตียง ${selPatient.bed}`:''}{selPatient.doctor?` · ${selPatient.doctor}`:''}</div>

              {/* Multi image */}
              <div style={{ marginBottom:14 }}>
                <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8 }}>
                  <label style={{ fontSize:13,color:'#94a3b8' }}>ภาพแผล {uploadImgs.length>0?`(${uploadImgs.length} ภาพ)`:''}</label>
                  {uploadImgs.length>0 && <span style={{ fontSize:12,color:'#0ea5e9',cursor:'pointer' }} onClick={()=>fileRef.current.click()}>+ เพิ่มภาพอีก</span>}
                </div>
                {uploadImgs.length>0 && (
                  <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(95px,1fr))',gap:7,marginBottom:8 }}>
                    {uploadImgs.map((img,idx)=>(
                      <div key={idx} style={{ position:'relative',borderRadius:9,overflow:'hidden' }}>
                        <img src={img.previewUrl} alt="" style={{ width:'100%',height:85,objectFit:'cover',display:'block' }}/>
                        <div style={{ position:'absolute',top:3,left:5,background:'rgba(15,23,42,0.8)',borderRadius:4,padding:'1px 6px',fontSize:10,color:'#fff',fontWeight:700 }}>ภาพ {idx+1}</div>
                        <button onClick={()=>setUploadImgs(prev=>prev.filter((_,i)=>i!==idx))} style={{ position:'absolute',top:3,right:3,background:'rgba(239,68,68,0.9)',border:'none',borderRadius:'50%',width:20,height:20,color:'#fff',cursor:'pointer',fontSize:13,display:'flex',alignItems:'center',justifyContent:'center' }}>×</button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="upload-zone" style={{ height:uploadImgs.length>0?65:150 }} onClick={()=>fileRef.current.click()}>
                  <div style={{ fontSize:uploadImgs.length>0?22:30,marginBottom:4 }}>📷</div>
                  <div style={{ fontSize:13,color:'#64748b' }}>{uploadImgs.length>0?'+ เพิ่มภาพอีก':'แตะเพื่อเลือกภาพ (เลือกได้หลายภาพ)'}</div>
                </div>
                <input ref={fileRef} type="file" accept="image/*" multiple style={{ display:'none' }} onChange={handleImgsChange}/>
              </div>

              <div style={{ marginBottom:12 }}>
                <label style={{ fontSize:13,color:'#94a3b8',marginBottom:7,display:'block' }}>วันที่ถ่ายภาพ</label>
                <input type="date" value={uploadForm.date} onChange={e=>setUploadForm(f=>({...f,date:e.target.value}))}/>
              </div>
              <div style={{ marginBottom:12 }}>
                <label style={{ fontSize:13,color:'#94a3b8',marginBottom:7,display:'block' }}>เวร</label>
                <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:7 }}>
                  {[{v:'morning',l:'🌅 เวรเช้า'},{v:'afternoon',l:'🌤️ เวรบ่าย'},{v:'night',l:'🌙 เวรดึก'}].map(s=>(
                    <button key={s.v} type="button" className="btn" style={{ padding:'9px 0',fontSize:12,fontWeight:600,background:uploadForm.shift===s.v?'linear-gradient(135deg,#0ea5e9,#0284c7)':'rgba(255,255,255,0.07)',color:uploadForm.shift===s.v?'#fff':'#94a3b8',border:uploadForm.shift===s.v?'none':'1px solid rgba(255,255,255,0.1)' }} onClick={()=>setUploadForm(f=>({...f,shift:f.shift===s.v?'':s.v}))}>{s.l}</button>
                  ))}
                </div>
              </div>
              <div style={{ marginBottom:12 }}>
                <label style={{ fontSize:13,color:'#94a3b8',marginBottom:7,display:'block' }}>สถานะแผล</label>
                <select value={uploadForm.status} onChange={e=>setUploadForm(f=>({...f,status:e.target.value}))}>
                  {WOUND_STATUS.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div style={{ marginBottom:18 }}>
                <label style={{ fontSize:13,color:'#94a3b8',marginBottom:7,display:'block' }}>หมายเหตุ (ใช้กับทุกภาพ)</label>
                <textarea rows={2} placeholder="เช่น แผลแห้งดี ไม่มีสิ่งคัดหลั่ง..." value={uploadForm.note} onChange={e=>setUploadForm(f=>({...f,note:e.target.value}))} style={{ resize:'none' }}/>
              </div>
              <div style={{ display:'flex',gap:10 }}>
                <button className="btn btn-blue" style={{ flex:1 }} onClick={handleUpload} disabled={uploadImgs.length===0||saving}>
                  {saving?'⏳ กำลังอัปโหลด...':`บันทึก ${uploadImgs.length||0} ภาพ`}
                </button>
                <button className="btn btn-ghost" onClick={()=>{ setUploadImgs([]);setUploadForm(EMPTY_UPLOAD);setView('site') }}>ยกเลิก</button>
              </div>
            </div>
          </div>
        )}

        {/* COMPARE */}
        {view==='compare' && selSite && (
          <div>
            <div style={{ marginBottom:14,display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexWrap:'wrap',gap:10 }}>
              <div><div style={{ fontWeight:700,fontSize:17,marginBottom:3 }}>🔍 เปรียบเทียบภาพแผล</div>
                <div style={{ fontSize:13,color:'#64748b' }}>{selSite.name} · เลือก 2 ภาพ</div></div>
              <div style={{ display:'flex',gap:7 }}>
                <button className="btn btn-ghost" style={{ fontSize:12,padding:'5px 11px' }} onClick={()=>{ setSelSite(null);setView('patient') }}>← ผู้ป่วย</button>
                <button className="btn btn-ghost" style={{ fontSize:12,padding:'5px 11px' }} onClick={()=>{ setSelPatient(null);setSelSite(null);setView('list') }}>🏠</button>
              </div>
            </div>
            {compareMode.a&&compareMode.b ? (
              <div>
                <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:14 }}>
                  {[compareMode.a,compareMode.b].map((rec,i)=>(
                    <div key={rec.id} className="card" style={{ overflow:'hidden' }}>
                      <div style={{ padding:'8px 12px',background:i===0?'rgba(14,165,233,.1)':'rgba(249,115,22,.1)',display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:4 }}>
                        <span style={{ fontWeight:700,fontSize:12,color:i===0?'#38bdf8':'#fb923c' }}>{i===0?'🔵':'🟠'} ภาพที่ {siteRecs.findIndex(r=>r.id===rec.id)+1} · POD {rec.day}</span>
                        <span className="badge" style={{ background:getStatus(rec.status).color+'22',color:getStatus(rec.status).color }}>{getStatus(rec.status).label}</span>
                      </div>
                      <img src={rec.imageUrl} alt="wound" style={{ width:'100%',height:210,objectFit:'cover',display:'block',cursor:'pointer' }} onClick={()=>setLightboxImg(rec.imageUrl)}/>
                      <div style={{ padding:'9px 12px' }}>
                        <div style={{ display:'flex',justifyContent:'space-between' }}>
                          <div style={{ fontSize:12,color:'#64748b' }}>{formatDate(rec.date)}</div>
                          <div style={{ fontSize:12,color:'#e2e8f0',background:'rgba(0,0,0,0.3)',borderRadius:5,padding:'1px 7px',fontWeight:600 }}>🕐 {rec.time||'--:--'}</div>
                        </div>
                        {rec.note && <div style={{ fontSize:12,color:'#94a3b8',marginTop:4 }}>{rec.note}</div>}
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ display:'flex',gap:8,flexWrap:'wrap' }}>
                  <button className="btn btn-ghost" onClick={()=>setCompareMode({a:null,b:null})}>← เลือกใหม่</button>
                  <button className="btn btn-ghost" onClick={()=>setView('site')}>กลับหน้าแผล</button>
                </div>
              </div>
            ) : (
              <div>
                <div style={{ marginBottom:10,fontSize:13,color:'#94a3b8' }}>เลือกแล้ว {[compareMode.a,compareMode.b].filter(Boolean).length} / 2 ภาพ</div>
                <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))',gap:10 }}>
                  {siteRecs.slice().reverse().map(rec=>{
                    const isA=compareMode.a?.id===rec.id, isB=compareMode.b?.id===rec.id
                    const isSel=isA||isB, canSel=!isSel&&!(compareMode.a&&compareMode.b)
                    return (
                      <div key={rec.id} className={`thumb ${isA?'sel-a':isB?'sel-b':''}`} style={{ opacity:!canSel&&!isSel?.45:1 }}
                        onClick={()=>{ if(isSel)setCompareMode(m=>({a:m.a?.id===rec.id?null:m.a,b:m.b?.id===rec.id?null:m.b})); else if(canSel)setCompareMode(m=>!m.a?{...m,a:rec}:{...m,b:rec}) }}>
                        <div style={{ position:'relative' }}>
                          <img src={rec.imageUrl} alt="wound" style={{ width:'100%',height:115,objectFit:'cover',display:'block' }}/>
                          <div style={{ position:'absolute',top:5,left:5,background:'rgba(15,23,42,0.8)',borderRadius:4,padding:'1px 6px',fontSize:10,color:'#fff',fontWeight:700 }}>ภาพที่ {siteRecs.findIndex(r=>r.id===rec.id)+1}</div>
                        </div>
                        <div style={{ padding:'7px 9px',background:'rgba(0,0,0,.4)' }}>
                          <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center' }}>
                            <div style={{ fontWeight:700,fontSize:11 }}>POD {rec.day}</div>
                            <div style={{ fontSize:10,color:'#94a3b8' }}>🕐 {rec.time||'--:--'}</div>
                          </div>
                          <div style={{ fontSize:10,color:'#64748b',marginTop:2 }}>{formatDate(rec.date)}</div>
                          <span className="badge" style={{ background:getStatus(rec.status).color+'22',color:getStatus(rec.status).color,marginTop:3,fontSize:10 }}>{getStatus(rec.status).label}</span>
                          {isSel && <div style={{ fontSize:10,color:isA?'#38bdf8':'#fb923c',fontWeight:700,marginTop:2 }}>✓ {isA?'ฝั่งซ้าย':'ฝั่งขวา'}</div>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* EDIT RECORD MODAL */}
      {editingRec && (
        <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,.85)',zIndex:998,display:'flex',alignItems:'center',justifyContent:'center',padding:20 }}>
          <div className="card" style={{ maxWidth:440,width:'100%',padding:'22px 22px' }}>
            <div style={{ fontWeight:700,fontSize:17,marginBottom:14 }}>✏️ แก้ไขบันทึกภาพ</div>
            <div style={{ position:'relative',marginBottom:12 }}>
              <img src={editRecForm.newImgUrl||editingRec.imageUrl} alt="wound" style={{ width:'100%',height:150,objectFit:'cover',borderRadius:10,display:'block' }}/>
              <label style={{ position:'absolute',bottom:8,right:8,background:'rgba(14,165,233,0.9)',color:'#fff',borderRadius:7,padding:'4px 11px',fontSize:12,fontWeight:700,cursor:'pointer' }}>
                🔄 เปลี่ยนภาพ
                <input ref={editFileRef} type="file" accept="image/*" style={{ display:'none' }} onChange={handleEditImageChange}/>
              </label>
              {editRecForm.newImgUrl && <div style={{ position:'absolute',top:8,left:8,background:'rgba(34,197,94,0.9)',color:'#fff',borderRadius:5,padding:'2px 8px',fontSize:11,fontWeight:700 }}>✓ ภาพใหม่</div>}
            </div>
            <div style={{ marginBottom:11 }}><label style={{ fontSize:13,color:'#94a3b8',marginBottom:7,display:'block' }}>วันที่</label>
              <input type="date" value={editRecForm.date} onChange={e=>setEditRecForm(f=>({...f,date:e.target.value}))}/></div>
            <div style={{ marginBottom:11 }}>
              <label style={{ fontSize:13,color:'#94a3b8',marginBottom:7,display:'block' }}>เวร</label>
              <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:6 }}>
                {[{v:'morning',l:'🌅 เช้า'},{v:'afternoon',l:'🌤️ บ่าย'},{v:'night',l:'🌙 ดึก'}].map(s=>(
                  <button key={s.v} type="button" className="btn" style={{ padding:'7px 0',fontSize:12,fontWeight:600,background:editRecForm.shift===s.v?'linear-gradient(135deg,#0ea5e9,#0284c7)':'rgba(255,255,255,0.07)',color:editRecForm.shift===s.v?'#fff':'#94a3b8',border:editRecForm.shift===s.v?'none':'1px solid rgba(255,255,255,0.1)' }} onClick={()=>setEditRecForm(f=>({...f,shift:f.shift===s.v?'':s.v}))}>{s.l}</button>
                ))}
              </div>
            </div>
            <div style={{ marginBottom:11 }}><label style={{ fontSize:13,color:'#94a3b8',marginBottom:7,display:'block' }}>สถานะแผล</label>
              <select value={editRecForm.status} onChange={e=>setEditRecForm(f=>({...f,status:e.target.value}))}>
                {WOUND_STATUS.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}
              </select></div>
            <div style={{ marginBottom:18 }}><label style={{ fontSize:13,color:'#94a3b8',marginBottom:7,display:'block' }}>หมายเหตุ</label>
              <textarea rows={2} value={editRecForm.note} onChange={e=>setEditRecForm(f=>({...f,note:e.target.value}))} style={{ resize:'none' }}/></div>
            <div style={{ display:'flex',gap:10 }}>
              <button className="btn btn-blue" style={{ flex:1 }} disabled={saving} onClick={handleUpdateRec}>{saving?'⏳...':'บันทึก'}</button>
              <button className="btn btn-ghost" onClick={()=>setEditingRec(null)}>ยกเลิก</button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM DELETE RECORD */}
      {confirmDelRec && (
        <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,.75)',zIndex:998,display:'flex',alignItems:'center',justifyContent:'center',padding:20 }}>
          <div className="card" style={{ maxWidth:360,width:'100%',padding:'22px 22px',textAlign:'center' }}>
            <div style={{ fontSize:30,marginBottom:10 }}>🗑️</div>
            <div style={{ fontWeight:700,fontSize:16,marginBottom:8 }}>ยืนยันการลบภาพ</div>
            <img src={confirmDelRec.imageUrl} alt="wound" style={{ width:'100%',height:130,objectFit:'cover',borderRadius:10,display:'block',marginBottom:10 }}/>
            <div style={{ fontSize:13,color:'#94a3b8',marginBottom:8 }}>POD {confirmDelRec.day} · {formatDate(confirmDelRec.date)}</div>
            <div style={{ background:'rgba(239,68,68,0.1)',border:'1px solid rgba(239,68,68,0.2)',borderRadius:10,padding:'10px',marginBottom:16,fontSize:13,color:'#fca5a5' }}>⚠️ ลบอย่างถาวร ไม่สามารถกู้คืนได้</div>
            <div style={{ display:'flex',gap:10 }}>
              <button className="btn" style={{ flex:1,background:'linear-gradient(135deg,#ef4444,#dc2626)',color:'#fff' }} onClick={()=>handleDeleteRec(confirmDelRec)}>{saving?'⏳...':'ยืนยันลบ'}</button>
              <button className="btn btn-ghost" style={{ flex:1 }} onClick={()=>setConfirmDelRec(null)}>ยกเลิก</button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM DELETE PATIENT */}
      {confirmDelPat && (
        <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,.75)',zIndex:998,display:'flex',alignItems:'center',justifyContent:'center',padding:20 }}>
          <div className="card" style={{ maxWidth:400,width:'100%',padding:'24px 22px' }}>
            <div style={{ fontSize:30,textAlign:'center',marginBottom:10 }}>🗑️</div>
            <div style={{ fontWeight:700,fontSize:16,textAlign:'center',marginBottom:6 }}>ยืนยันการลบผู้ป่วย</div>
            <div style={{ fontSize:14,color:'#94a3b8',textAlign:'center',marginBottom:4 }}><strong style={{ color:'#e2e8f0' }}>{confirmDelPat.name}</strong></div>
            <div style={{ background:'rgba(239,68,68,0.1)',border:'1px solid rgba(239,68,68,0.2)',borderRadius:10,padding:'11px',marginTop:14,marginBottom:18,fontSize:13,color:'#fca5a5',lineHeight:1.6 }}>
              ⚠️ จะลบข้อมูลผู้ป่วย ตำแหน่งแผล และภาพทั้งหมดอย่างถาวร
            </div>
            <div style={{ display:'flex',gap:10 }}>
              <button className="btn" style={{ flex:1,background:'linear-gradient(135deg,#ef4444,#dc2626)',color:'#fff' }} onClick={()=>deletePat(confirmDelPat)}>{saving?'⏳...':'ยืนยันลบ'}</button>
              <button className="btn btn-ghost" style={{ flex:1 }} onClick={()=>setConfirmDelPat(null)}>ยกเลิก</button>
            </div>
          </div>
        </div>
      )}

      {/* EXPORT MODAL */}
      {showExport && (
        <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,.85)',zIndex:999,overflowY:'auto',padding:'18px 16px' }}>
          <div style={{ maxWidth:580,margin:'0 auto' }}>
            <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14 }}>
              <div>
                <div style={{ fontWeight:700,fontSize:18 }}>📤 ส่งออกภาพแผล</div>
                <div style={{ fontSize:13,color:'#94a3b8',marginTop:2 }}>{exportImgs.length===0?'กำลังสร้างภาพ...':`สร้างแล้ว ${exportImgs.length} ภาพ`}</div>
              </div>
              <button className="btn btn-ghost" onClick={()=>setShowExport(false)}>✕ ปิด</button>
            </div>
            {exportImgs.length>0 && (
              <div style={{ display:'flex',gap:9,marginBottom:14 }}>
                <button className="btn btn-blue" style={{ flex:2,fontSize:13,padding:'10px 0' }} onClick={()=>mergeAndDownload(exportImgs)}>📎 รวมเป็นไฟล์เดียว ({exportImgs.length} ภาพ)</button>
                <button className="btn btn-ghost" style={{ flex:1,fontSize:12,padding:'10px 0' }} onClick={()=>exportImgs.forEach((item,i)=>setTimeout(()=>{ const a=document.createElement('a');a.href=item.url;a.download=`wound_POD${item.pod}_${selSite?.name}_${item.date}.jpg`;document.body.appendChild(a);a.click();document.body.removeChild(a) },i*600))}>⬇️ แยกไฟล์</button>
              </div>
            )}
            {exportImgs.length===0 && <div style={{ textAlign:'center',padding:50,color:'#64748b' }}><div className="spinner" style={{ margin:'0 auto 14px' }}/><div>กำลังสร้างภาพ...</div></div>}
            <div style={{ display:'flex',flexDirection:'column',gap:14 }}>
              {exportImgs.map(item=>(
                <div key={item.date} className="card" style={{ overflow:'hidden' }}>
                  <div style={{ padding:'9px 13px',background:'rgba(14,165,233,0.1)',display:'flex',justifyContent:'space-between',alignItems:'center' }}>
                    <span style={{ fontWeight:700,fontSize:13 }}>POD {item.pod} · {formatDate(item.date)}</span>
                    <a href={item.url} download={`wound_POD${item.pod}_${selSite?.name}_${item.date}.jpg`} style={{ background:'rgba(14,165,233,0.2)',color:'#38bdf8',borderRadius:7,padding:'3px 11px',fontSize:12,fontWeight:700,textDecoration:'none' }}>⬇️</a>
                  </div>
                  <img src={item.url} alt={`POD ${item.pod}`} style={{ width:'100%',display:'block' }}/>
                </div>
              ))}
            </div>
            {exportImgs.length>0 && (
              <div style={{ marginTop:14,padding:'12px 15px',background:'rgba(14,165,233,0.08)',borderRadius:11,fontSize:13,color:'#94a3b8',lineHeight:1.7 }}>
                💡 กด <strong style={{ color:'#e2e8f0' }}>📎 รวมเป็นไฟล์เดียว</strong> → บันทึกลงเครื่อง → เปิด LINE → แนบรูปส่งแพทย์ค่ะ
              </div>
            )}
          </div>
        </div>
      )}

      {/* STORAGE MODAL */}
      {showStorage && (
        <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,.85)',zIndex:999,display:'flex',alignItems:'center',justifyContent:'center',padding:20 }}>
          <div className="card" style={{ maxWidth:440,width:'100%',padding:'24px 22px' }}>
            <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:18 }}>
              <div style={{ fontWeight:700,fontSize:18 }}>💾 การใช้พื้นที่จัดเก็บ</div>
              <button className="btn btn-ghost" onClick={()=>setShowStorage(false)}>✕</button>
            </div>
            {!storageStats && <div style={{ textAlign:'center',padding:36,color:'#64748b' }}><div className="spinner" style={{ margin:'0 auto 12px' }}/><div>กำลังตรวจสอบ...</div></div>}
            {storageStats?.error && <div style={{ color:'#f87171',textAlign:'center',padding:20 }}>❌ {storageStats.error}</div>}
            {storageStats && !storageStats.error && (
              <div style={{ display:'flex',flexDirection:'column',gap:18 }}>
                <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10 }}>
                  {[{l:'ผู้ป่วย',v:storageStats.patients,i:'👤'},{l:'ตำแหน่งแผล',v:storageStats.sites,i:'📍'},{l:'ภาพทั้งหมด',v:storageStats.records,i:'📷'}].map(item=>(
                    <div key={item.l} style={{ background:'rgba(255,255,255,0.05)',borderRadius:12,padding:'14px 10px',textAlign:'center' }}>
                      <div style={{ fontSize:22,marginBottom:5 }}>{item.i}</div>
                      <div style={{ fontWeight:700,fontSize:20,color:'#e2e8f0' }}>{item.v}</div>
                      <div style={{ fontSize:11,color:'#64748b',marginTop:2 }}>{item.l}</div>
                    </div>
                  ))}
                </div>
                <div>
                  <div style={{ display:'flex',justifyContent:'space-between',marginBottom:7 }}>
                    <span style={{ fontSize:14,fontWeight:600 }}>🖼️ พื้นที่เก็บภาพ</span>
                    <span style={{ fontSize:13,color:'#94a3b8' }}>{storageStats.estImgMB} MB / {storageStats.maxImgMB} MB</span>
                  </div>
                  <div style={{ background:'rgba(255,255,255,0.08)',borderRadius:7,height:11,overflow:'hidden' }}>
                    <div style={{ height:'100%',borderRadius:7,width:`${storageStats.imgPct}%`,background:storageStats.imgPct>80?'linear-gradient(90deg,#ef4444,#dc2626)':storageStats.imgPct>50?'linear-gradient(90deg,#f97316,#ea580c)':'linear-gradient(90deg,#22c55e,#16a34a)' }}/>
                  </div>
                  <div style={{ display:'flex',justifyContent:'space-between',marginTop:5 }}>
                    <span style={{ fontSize:12,color:storageStats.imgPct>80?'#f87171':'#64748b' }}>ใช้ไป {storageStats.imgPct}%</span>
                    <span style={{ fontSize:12,color:'#64748b' }}>รับได้อีก ~{storageStats.remaining.toLocaleString()} ภาพ</span>
                  </div>
                </div>
                <div style={{ background:'rgba(14,165,233,0.08)',borderRadius:11,padding:'12px 14px',fontSize:13,color:'#94a3b8',lineHeight:1.7 }}>
                  💡 ลบผู้ป่วยที่จำหน่ายแล้วออก เพื่อเพิ่มพื้นที่ว่างค่ะ
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* LIGHTBOX */}
      {lightboxImg && <div className="lightbox" onClick={()=>setLightboxImg(null)}><img src={lightboxImg} alt="fullsize"/></div>}

      {/* TOAST */}
      {toast && <div style={{ position:'fixed',bottom:22,left:'50%',transform:'translateX(-50%)',background:'#1e293b',border:'1px solid rgba(255,255,255,.1)',borderRadius:11,padding:'9px 18px',fontSize:14,fontWeight:600,zIndex:1000,boxShadow:'0 4px 20px rgba(0,0,0,.4)',whiteSpace:'nowrap' }}>{toast}</div>}
    </div>
  )
}
