import { useState, useRef, useEffect, useCallback } from 'react'
import { supabase } from './supabase.js'

// ── Constants ──
const WOUND_STATUS = [
  { value: 'healing', label: 'หายดี', color: '#22c55e' },
  { value: 'normal', label: 'ปกติ', color: '#3b82f6' },
  { value: 'inflamed', label: 'อักเสบ', color: '#f97316' },
  { value: 'infected', label: 'ติดเชื้อ', color: '#ef4444' },
  { value: 'dehiscence', label: 'แผลแยก', color: '#a855f7' },
]
const SITE_COLORS = ['#0ea5e9','#a78bfa','#34d399','#fb923c','#f472b6','#facc15']

function daysSince(d) { return Math.max(0, Math.floor((new Date() - new Date(d)) / 86400000)) }
function formatDate(d) { return new Date(d).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' }) }
function getStatus(val) { return WOUND_STATUS.find(s => s.value === val) || WOUND_STATUS[1] }
function sc(idx) { return SITE_COLORS[idx % SITE_COLORS.length] }

// ── CSS ──
const css = `
  @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  ::-webkit-scrollbar { width: 5px; } ::-webkit-scrollbar-track { background: #1e293b; } ::-webkit-scrollbar-thumb { background: #334155; border-radius: 3px; }
  body { font-family: 'Sarabun', sans-serif; background: #0f172a; color: #e2e8f0; }
  .card { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; }
  .hoverable { transition: border-color .2s, transform .15s; cursor: pointer; }
  .hoverable:hover { border-color: rgba(14,165,233,0.45) !important; transform: translateY(-1px); }
  .btn { border: none; border-radius: 10px; cursor: pointer; font-family: 'Sarabun', sans-serif; font-size: 14px; font-weight: 600; padding: 9px 18px; transition: all .2s; }
  .btn-blue { background: linear-gradient(135deg,#0ea5e9,#0284c7); color: #fff; }
  .btn-blue:hover { box-shadow: 0 4px 14px rgba(14,165,233,.4); transform: translateY(-1px); }
  .btn-blue:disabled { opacity: .4; cursor: not-allowed; transform: none !important; }
  .btn-ghost { background: rgba(255,255,255,0.07); color: #94a3b8; border: 1px solid rgba(255,255,255,0.1); }
  .btn-ghost:hover { background: rgba(255,255,255,0.13); color: #e2e8f0; }
  .badge { padding: 3px 10px; border-radius: 20px; font-size: 12px; font-weight: 600; display: inline-block; }
  input, textarea, select { background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.12); border-radius: 10px; color: #e2e8f0; font-family: 'Sarabun', sans-serif; font-size: 14px; padding: 10px 14px; width: 100%; outline: none; transition: border .2s; }
  input:focus, textarea:focus, select:focus { border-color: #0ea5e9; }
  select option { background: #1e293b; }
  .thumb { border-radius: 10px; overflow: hidden; cursor: pointer; transition: all .2s; border: 2px solid transparent; }
  .thumb:hover { transform: scale(1.03); border-color: #0ea5e9; }
  .thumb.sel-a { border-color: #0ea5e9 !important; box-shadow: 0 0 16px rgba(14,165,233,.4); }
  .thumb.sel-b { border-color: #fb923c !important; box-shadow: 0 0 16px rgba(249,115,22,.4); }
  .lightbox { position: fixed; inset: 0; background: rgba(0,0,0,.92); display: flex; align-items: center; justify-content: center; z-index: 999; cursor: pointer; }
  .lightbox img { max-width: 90vw; max-height: 90vh; border-radius: 12px; }
  .upload-zone { border: 2px dashed rgba(255,255,255,.14); border-radius: 13px; height: 190px; display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer; overflow: hidden; transition: border .2s; }
  .upload-zone:hover { border-color: rgba(14,165,233,.5); }
  .spinner { width: 32px; height: 32px; border: 3px solid rgba(14,165,233,.3); border-top-color: #0ea5e9; border-radius: 50%; animation: spin .8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
`

export default function App() {
  const [patients, setPatients] = useState([])
  const [woundSites, setWoundSites] = useState({}) // { patientId: [site] }
  const [records, setRecords] = useState({})        // { siteId: [record] }
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')

  const [selectedPatient, setSelectedPatient] = useState(null)
  const [selectedSite, setSelectedSite] = useState(null)
  const [view, setView] = useState('list')

  const EMPTY_P = { name: '', age: '', hn: '', surgery: '', surgeryDate: '' }
  const [patientForm, setPatientForm] = useState(EMPTY_P)
  const [editingPatient, setEditingPatient] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)

  const [addSiteForm, setAddSiteForm] = useState({ name: '', location: '' })
  const [editSiteForm, setEditSiteForm] = useState({ name: '', location: '' })
  const [editingSite, setEditingSite] = useState(null)

  const [uploadForm, setUploadForm] = useState({ status: 'normal', note: '', imageUrl: null, file: null, date: new Date().toISOString().split('T')[0], shift: '' })
  const [editingRecord, setEditingRecord] = useState(null) // record being edited
  const [editRecForm, setEditRecForm] = useState({ status: 'normal', note: '', date: '', newImageUrl: null, newFile: null })
  const [confirmDeleteRec, setConfirmDeleteRec] = useState(null) // record to delete
  const [compareMode, setCompareMode] = useState({ a: null, b: null })
  const [lightboxImg, setLightboxImg] = useState(null)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [exportImages, setExportImages] = useState([])
  const [showExport, setShowExport] = useState(false)

  const fileRef = useRef()

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2500) }

  // ── Load all data ──
  useEffect(() => {
    loadAll()
  }, [])

  const loadAll = async () => {
    setLoading(true)
    try {
      const [{ data: pts }, { data: sites }, { data: recs }] = await Promise.all([
        supabase.from('patients').select('*').order('created_at'),
        supabase.from('wound_sites').select('*').order('created_at'),
        supabase.from('wound_records').select('*').order('created_at'),
      ])
      setPatients(pts || [])
      const sitesMap = {}
      ;(sites || []).forEach(s => {
        if (!sitesMap[s.patient_id]) sitesMap[s.patient_id] = []
        sitesMap[s.patient_id].push({ id: s.id, patientId: s.patient_id, name: s.name, location: s.location })
      })
      setWoundSites(sitesMap)
      const recsMap = {}
      ;(recs || []).forEach(r => {
        if (!recsMap[r.site_id]) recsMap[r.site_id] = []
        recsMap[r.site_id].push({
          id: r.id, siteId: r.site_id, date: r.date, day: r.day,
          time: r.time, shift: r.shift, status: r.status, note: r.note, imageUrl: r.image_url
        })
      })
      setRecords(recsMap)
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  const patientSites = selectedPatient ? (woundSites[selectedPatient.id] || []) : []
  const siteRecords = selectedSite ? (records[selectedSite.id] || []) : []

  // ── Patients CRUD ──
  const savePatient = async () => {
    setSaving(true)
    const data = {
      name: patientForm.name.trim(),
      age: Number(patientForm.age) || 0,
      hn: patientForm.hn.trim(),
      surgery: patientForm.surgery.trim(),
      surgery_date: patientForm.surgeryDate || null,
    }
    if (editingPatient) {
      await supabase.from('patients').update(data).eq('id', editingPatient.id)
    } else {
      data.id = `P${Date.now()}`
      await supabase.from('patients').insert(data)
    }
    await loadAll()
    setSaving(false)
    showToast('✅ บันทึกสำเร็จ')
    setView('list')
  }

  const deletePatient = async (p) => {
    setSaving(true)
    await supabase.from('patients').delete().eq('id', p.id)
    await loadAll()
    setSaving(false)
    setConfirmDelete(null)
    showToast('🗑️ ลบผู้ป่วยแล้ว')
  }

  // ── Sites CRUD ──
  const addSite = async () => {
    if (!addSiteForm.name.trim()) return
    setSaving(true)
    await supabase.from('wound_sites').insert({
      id: `site_${Date.now()}`,
      patient_id: selectedPatient.id,
      name: addSiteForm.name.trim(),
      location: addSiteForm.location.trim(),
    })
    await loadAll()
    setSaving(false)
    showToast('✅ เพิ่มตำแหน่งแผลแล้ว')
    setAddSiteForm({ name: '', location: '' })
    setView('patient')
  }

  const updateSite = async () => {
    if (!editSiteForm.name.trim()) return
    setSaving(true)
    await supabase.from('wound_sites').update({
      name: editSiteForm.name.trim(),
      location: editSiteForm.location.trim(),
    }).eq('id', editingSite.id)
    await loadAll()
    // refresh selectedSite
    const updated = { ...editingSite, name: editSiteForm.name.trim(), location: editSiteForm.location.trim() }
    setSelectedSite(updated)
    setSaving(false)
    showToast('✅ แก้ไขตำแหน่งแผลแล้ว')
    setEditingSite(null)
    setView('site')
  }

  // ── Upload photo ──
  // ── Edit record ──
  const handleUpdateRecord = async () => {
    if (!editingRecord) return
    setSaving(true)
    try {
      const recDate = editRecForm.date || editingRecord.date
      const recDay = Math.max(0, Math.floor((new Date(recDate) - new Date(selectedPatient.surgery_date)) / 86400000))
      let imageUrl = editingRecord.imageUrl
      // Replace image if new file selected
      if (editRecForm.newFile) {
        // Delete old image
        try {
          const oldPath = editingRecord.imageUrl.split('/wound-images/')[1]
          if (oldPath) await supabase.storage.from('wound-images').remove([oldPath])
        } catch(e) { console.log('old img delete:', e) }
        // Upload new image
        const ext = editRecForm.newFile.name.split('.').pop()
        const fileName = `${selectedSite.id}/${Date.now()}.${ext}`
        const { error: upErr } = await supabase.storage
          .from('wound-images')
          .upload(fileName, editRecForm.newFile, { contentType: editRecForm.newFile.type })
        if (upErr) throw upErr
        const { data: urlData } = supabase.storage.from('wound-images').getPublicUrl(fileName)
        imageUrl = urlData.publicUrl
      }
      await supabase.from('wound_records').update({
        status: editRecForm.status,
        note: editRecForm.note,
        date: recDate,
        day: recDay,
        image_url: imageUrl,
      }).eq('id', editingRecord.id)
      await loadAll()
      showToast('✅ แก้ไขบันทึกแล้ว')
    } catch(e) {
      showToast('❌ แก้ไขไม่สำเร็จ: ' + e.message)
    }
    setSaving(false)
    setEditingRecord(null)
  }

  // ── Delete record ──
  const handleDeleteRecord = async (rec) => {
    setSaving(true)
    // Delete image from storage
    try {
      const path = rec.imageUrl.split('/wound-images/')[1]
      if (path) await supabase.storage.from('wound-images').remove([path])
    } catch(e) { console.log('storage delete:', e) }
    await supabase.from('wound_records').delete().eq('id', rec.id)
    await loadAll()
    setSaving(false)
    setConfirmDeleteRec(null)
    showToast('🗑️ ลบภาพแล้ว')
  }

  const handleEditImageChange = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => setEditRecForm(f => ({ ...f, newImageUrl: ev.target.result, newFile: file }))
    reader.readAsDataURL(file)
  }

  const handleImageChange = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => setUploadForm(f => ({ ...f, imageUrl: ev.target.result, file }))
    reader.readAsDataURL(file)
  }

  const handleUpload = async () => {
    if (!uploadForm.file) return
    setSaving(true)
    try {
      // Upload image to Supabase Storage
      const ext = uploadForm.file.name.split('.').pop()
      const fileName = `${selectedSite.id}/${Date.now()}.${ext}`
      const { data: upData, error: upErr } = await supabase.storage
        .from('wound-images')
        .upload(fileName, uploadForm.file, { contentType: uploadForm.file.type })
      if (upErr) throw upErr
      const { data: urlData } = supabase.storage.from('wound-images').getPublicUrl(fileName)
      const imageUrl = urlData.publicUrl

      // Save record to DB
      const recDate = uploadForm.date || new Date().toISOString().split('T')[0]
      const recDay = Math.max(0, Math.floor((new Date(recDate) - new Date(selectedPatient.surgery_date)) / 86400000))
      await supabase.from('wound_records').insert({
        id: Date.now(),
        site_id: selectedSite.id,
        date: recDate,
        day: recDay,
        time: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }),
        shift: uploadForm.shift,
        status: uploadForm.status,
        note: uploadForm.note,
        image_url: imageUrl,
      })
      await loadAll()
      showToast('✅ บันทึกภาพแผลแล้ว')
      setUploadForm({ status: 'normal', note: '', imageUrl: null, file: null, date: new Date().toISOString().split('T')[0], shift: '' })
      setView('site')
    } catch (e) {
      console.error(e)
      showToast('❌ บันทึกไม่สำเร็จ: ' + e.message)
    }
    setSaving(false)
  }

  // ── Export image ──
  const buildDayImage = (date, dayRecs, patient, site, allRecs) => new Promise(resolve => {
    const PAD=20, COLS=Math.min(dayRecs.length,2), GAP=12
    const IMG_W=320, IMG_H=260, INFO_H=64
    const CELL_W=IMG_W, CELL_H=IMG_H+INFO_H
    const HEADER_H=80, FOOTER_H=36
    const W=PAD+COLS*(CELL_W+GAP)-GAP+PAD
    const ROWS=Math.ceil(dayRecs.length/COLS)
    const H=HEADER_H+ROWS*(CELL_H+GAP)-GAP+FOOTER_H+PAD
    const canvas=document.createElement('canvas')
    canvas.width=W*2; canvas.height=H*2
    const ctx=canvas.getContext('2d')
    ctx.scale(2,2)
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
    const promises = dayRecs.map((rec,i) => new Promise(r2 => {
      const col=i%COLS, row=Math.floor(i/COLS)
      const x=PAD+col*(CELL_W+GAP)
      const y=HEADER_H+GAP/2+row*(CELL_H+GAP)
      const photoNum = allRecs ? allRecs.findIndex(r=>r.id===rec.id)+1 : i+1
      ctx.fillStyle='#e2e8f0'; ctx.fillRect(x+2,y+2,CELL_W,CELL_H)
      ctx.fillStyle='#fff'; ctx.fillRect(x,y,CELL_W,CELL_H)
      const img=new Image(); img.crossOrigin='anonymous'
      img.onload=()=>{
        ctx.save(); ctx.rect(x,y,CELL_W,IMG_H); ctx.clip()
        ctx.drawImage(img,x,y,CELL_W,IMG_H); ctx.restore()
        ctx.fillStyle='rgba(15,23,42,0.75)'; ctx.fillRect(x+6,y+6,72,22)
        ctx.fillStyle='#fff'; ctx.font='bold 11px sans-serif'; ctx.textAlign='left'
        ctx.fillText(`ภาพที่ ${photoNum}`, x+10, y+21)
        ctx.fillStyle='rgba(0,0,0,0.55)'; ctx.fillRect(x,y+IMG_H-24,80,24)
        ctx.fillStyle='#fff'; ctx.font='bold 11px sans-serif'
        ctx.fillText(`🕐 ${rec.time||'--:--'}`, x+6, y+IMG_H-8)
        if(rec.shift){
          const shiftLabel = rec.shift==='morning'?'🌅 เช้า':rec.shift==='afternoon'?'🌤️ บ่าย':'🌙 ดึก'
          ctx.fillStyle=rec.shift==='morning'?'rgba(234,179,8,0.8)':rec.shift==='afternoon'?'rgba(14,165,233,0.8)':'rgba(99,102,241,0.8)'
          ctx.fillRect(x+86,y+IMG_H-24,70,24)
          ctx.fillStyle='#fff'; ctx.font='bold 11px sans-serif'
          ctx.fillText(shiftLabel, x+90, y+IMG_H-8)
        }
        const iy=y+IMG_H
        const st=getStatus(rec.status)
        ctx.fillStyle=st.color+'22'; ctx.fillRect(x,iy,CELL_W,28)
        ctx.fillStyle=st.color; ctx.font='bold 12px sans-serif'; ctx.textAlign='center'
        ctx.fillText(st.label, x+CELL_W/2, iy+19)
        if(rec.note){ ctx.fillStyle='#475569'; ctx.font='11px sans-serif'; ctx.textAlign='left'; ctx.fillText(rec.note.substring(0,42), x+6, iy+46) }
        r2()
      }
      img.onerror=()=>r2()
      img.src=rec.imageUrl
    }))
    Promise.all(promises).then(()=>{
      ctx.fillStyle='#e2e8f0'; ctx.fillRect(0,H-FOOTER_H,W,FOOTER_H)
      ctx.fillStyle='#94a3b8'; ctx.font='10px sans-serif'; ctx.textAlign='center'
      ctx.fillText(`W-CARE · Wound Care Tracker · Bueng Kan Hospital`, W/2, H-FOOTER_H+22)
      resolve(canvas.toDataURL('image/jpeg',0.92))
    })
  })

  // รวมภาพทั้งหมดเป็นไฟล์เดียว
  const mergeAndDownload = async (images) => {
    if (!images.length) return
    // Load all images first
    const loaded = await Promise.all(images.map(item => new Promise(resolve => {
      const img = new Image()
      img.onload = () => resolve({ img, item })
      img.onerror = () => resolve(null)
      img.src = item.url
    })))
    const valid = loaded.filter(Boolean)
    if (!valid.length) return

    // Calculate total canvas size
    const W = valid[0].img.width
    const GAP = 20
    const totalH = valid.reduce((h, { img }) => h + img.height + GAP, 0) - GAP

    const canvas = document.createElement('canvas')
    canvas.width = W
    canvas.height = totalH
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#f1f5f9'
    ctx.fillRect(0, 0, W, totalH)

    // Draw each image stacked vertically
    let y = 0
    valid.forEach(({ img }) => {
      ctx.drawImage(img, 0, y, W, img.height)
      y += img.height + GAP
    })

    // Download as single file
    const a = document.createElement('a')
    a.href = canvas.toDataURL('image/jpeg', 0.92)
    a.download = `wound_${selectedPatient?.name}_${selectedSite?.name}_${new Date().toISOString().split('T')[0]}.jpg`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  const handleExport = async (idsToExport) => {
    const recsToUse = idsToExport ? siteRecords.filter(r=>idsToExport.has(r.id)) : siteRecords
    if (!recsToUse.length) return
    setSelectMode(false); setSelectedIds(new Set())
    setShowExport(true); setExportImages([])
    const grouped = {}
    recsToUse.forEach(r => { if (!grouped[r.date]) grouped[r.date]=[]; grouped[r.date].push(r) })
    const dates = Object.keys(grouped).sort()
    for (const date of dates) {
      const img = await buildDayImage(date, grouped[date], selectedPatient, selectedSite, siteRecords)
      setExportImages(prev => [...prev, { date, pod: grouped[date][0].day, url: img }])
    }
  }

  if (loading) return (
    <div style={{ minHeight:'100vh', background:'#0f172a', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:16, color:'#94a3b8', fontFamily:'Sarabun,sans-serif' }}>
      <style>{css}</style>
      <div className="spinner" />
      <div>กำลังโหลดข้อมูล...</div>
    </div>
  )

  return (
    <div style={{ minHeight:'100vh', background:'linear-gradient(135deg,#0f172a 0%,#1e293b 60%,#0f2744 100%)', fontFamily:'Sarabun,sans-serif', color:'#e2e8f0' }}>
      <style>{css}</style>

      {/* HEADER */}
      <div style={{ background:'rgba(0,0,0,.3)', borderBottom:'1px solid rgba(255,255,255,.06)', padding:'13px 20px', display:'flex', alignItems:'center', gap:14, flexWrap:'wrap', position:'sticky', top:0, zIndex:100 }}>
        <div style={{ width:38, height:38, borderRadius:11, background:'linear-gradient(135deg,#0ea5e9,#6366f1)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>🩹</div>
        <div>
          <div style={{ fontWeight:700, fontSize:17 }}>W-CARE</div>
          <div style={{ fontSize:11, color:'#64748b' }}>ระบบติดตามแผลผ่าตัด · Bueng Kan Hospital</div>
        </div>
        {saving && <div style={{ fontSize:12, color:'#94a3b8', marginLeft:8 }}>⏳ กำลังบันทึก...</div>}
        <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:5, flexWrap:'wrap' }}>
          <button className="btn btn-ghost" style={{ padding:'5px 11px', fontSize:12 }} onClick={() => { setSelectedPatient(null); setSelectedSite(null); setView('list') }}>🏠 หน้าหลัก</button>
          {selectedPatient && <>
            <span style={{ color:'#334155' }}>›</span>
            <button className="btn btn-ghost" style={{ padding:'5px 11px', fontSize:12 }} onClick={() => { setSelectedSite(null); setView('patient') }}>{selectedPatient.name.split(' ')[0]}</button>
          </>}
          {selectedSite && <>
            <span style={{ color:'#334155' }}>›</span>
            <span style={{ color:'#e2e8f0', fontWeight:600, fontSize:12 }}>{selectedSite.name.length > 8 ? selectedSite.name.substring(0,8)+'...' : selectedSite.name}</span>
          </>}
        </div>
      </div>

      <div style={{ maxWidth:1100, margin:'0 auto', padding:'20px 16px' }}>

        {/* ══ LIST ══ */}
        {view === 'list' && (
          <div>
            <div style={{ marginBottom:16, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <h2 style={{ fontSize:18, fontWeight:700 }}>รายชื่อผู้ป่วย</h2>
              <button className="btn btn-blue" style={{ padding:'8px 16px', fontSize:13 }} onClick={() => { setPatientForm(EMPTY_P); setEditingPatient(null); setView('editPatient') }}>+ เพิ่มผู้ป่วย</button>
            </div>
            {patients.length === 0 ? (
              <div className="card" style={{ padding:52, textAlign:'center', color:'#475569' }}>
                <div style={{ fontSize:40, marginBottom:12 }}>👥</div>
                <div style={{ fontSize:15, fontWeight:600 }}>ยังไม่มีผู้ป่วย</div>
                <div style={{ fontSize:13, marginTop:8 }}>กด "+ เพิ่มผู้ป่วย" เพื่อเริ่มต้น</div>
              </div>
            ) : (
              <div style={{ display:'grid', gap:12 }}>
                {patients.map(p => {
                  const sites = woundSites[p.id] || []
                  const totalPics = sites.reduce((n,s) => n+(records[s.id]||[]).length, 0)
                  return (
                    <div key={p.id} className="card hoverable" style={{ padding:'15px 20px' }} onClick={() => { setSelectedPatient(p); setSelectedSite(null); setView('patient') }}>
                      <div style={{ display:'flex', alignItems:'center', gap:14 }}>
                        <div style={{ width:46, height:46, borderRadius:13, background:'linear-gradient(135deg,#1e3a5f,#1e40af)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, flexShrink:0 }}>
                          {p.name.startsWith('นางสาว') ? '👧' : p.name.startsWith('นาง') ? '👩' : '👨'}
                        </div>
                        <div style={{ flex:1 }}>
                          <div style={{ fontWeight:700, fontSize:15 }}>{p.name}</div>
                          <div style={{ fontSize:12, color:'#94a3b8', marginTop:2 }}>{p.id} · HN: {p.hn} · อายุ {p.age} ปี</div>
                          <div style={{ fontSize:12, color:'#64748b', marginTop:1 }}>🔪 {p.surgery} · {formatDate(p.surgery_date)}</div>
                        </div>
                        <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:4, flexShrink:0 }}>
                          <div style={{ fontSize:13, color:'#0ea5e9', fontWeight:700 }}>POD {daysSince(p.surgery_date)}</div>
                          <div style={{ fontSize:12, color:'#64748b' }}>{sites.length} ตำแหน่ง · {totalPics} ภาพ</div>
                          <div style={{ display:'flex', gap:6 }}>
                            <button className="btn btn-ghost" style={{ fontSize:11, padding:'3px 10px' }} onClick={e => { e.stopPropagation(); setPatientForm({ name:p.name, age:String(p.age), hn:p.hn||'', surgery:p.surgery||'', surgeryDate:p.surgery_date||'' }); setEditingPatient(p); setView('editPatient') }}>✏️</button>
                            <button className="btn btn-ghost" style={{ fontSize:11, padding:'3px 10px', color:'#f87171', borderColor:'rgba(239,68,68,.25)' }} onClick={e => { e.stopPropagation(); setConfirmDelete(p) }}>🗑️</button>
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

        {/* ══ ADD/EDIT PATIENT ══ */}
        {view === 'editPatient' && (
          <div style={{ maxWidth:500, margin:'0 auto' }}>
            <div className="card" style={{ padding:'26px 24px' }}>
              <div style={{ fontWeight:700, fontSize:17, marginBottom:20 }}>{editingPatient ? '✏️ แก้ไขข้อมูลผู้ป่วย' : '🏥 เพิ่มผู้ป่วยใหม่'}</div>
              <div style={{ display:'grid', gap:14 }}>
                <div><label style={{ fontSize:13, color:'#94a3b8', marginBottom:7, display:'block' }}>ชื่อ-นามสกุล *</label>
                  <input placeholder="เช่น นายสมชาย ใจดี" value={patientForm.name} onChange={e => setPatientForm(f=>({...f,name:e.target.value}))} /></div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                  <div><label style={{ fontSize:13, color:'#94a3b8', marginBottom:7, display:'block' }}>อายุ (ปี)</label>
                    <input type="number" placeholder="45" value={patientForm.age} onChange={e => setPatientForm(f=>({...f,age:e.target.value}))} /></div>
                  <div><label style={{ fontSize:13, color:'#94a3b8', marginBottom:7, display:'block' }}>HN</label>
                    <input placeholder="12345" value={patientForm.hn} onChange={e => setPatientForm(f=>({...f,hn:e.target.value}))} /></div>
                </div>
                <div><label style={{ fontSize:13, color:'#94a3b8', marginBottom:7, display:'block' }}>การผ่าตัด</label>
                  <input placeholder="เช่น ผ่าตัดไส้ติ่ง" value={patientForm.surgery} onChange={e => setPatientForm(f=>({...f,surgery:e.target.value}))} /></div>
                <div><label style={{ fontSize:13, color:'#94a3b8', marginBottom:7, display:'block' }}>วันที่ผ่าตัด *</label>
                  <input type="date" value={patientForm.surgeryDate} onChange={e => setPatientForm(f=>({...f,surgeryDate:e.target.value}))} /></div>
              </div>
              <div style={{ display:'flex', gap:11, marginTop:24 }}>
                <button className="btn btn-blue" style={{ flex:1 }} disabled={!patientForm.name.trim()||!patientForm.surgeryDate||saving} onClick={savePatient}>
                  {saving ? '⏳...' : editingPatient ? 'บันทึกการแก้ไข' : 'เพิ่มผู้ป่วย'}
                </button>
                <button className="btn btn-ghost" onClick={() => setView(editingPatient ? 'patient' : 'list')}>ยกเลิก</button>
              </div>
            </div>
          </div>
        )}

        {/* ══ PATIENT: wound sites ══ */}
        {view === 'patient' && selectedPatient && (
          <div>
            <div className="card" style={{ padding:'16px 20px', marginBottom:20 }}>
              <div style={{ display:'flex', alignItems:'flex-start', gap:14, flexWrap:'wrap' }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:700, fontSize:17 }}>{selectedPatient.name}</div>
                  <div style={{ fontSize:12, color:'#94a3b8', marginTop:3 }}>{selectedPatient.id} · HN: {selectedPatient.hn} · อายุ {selectedPatient.age} ปี</div>
                  <div style={{ fontSize:12, color:'#64748b', marginTop:2 }}>🔪 {selectedPatient.surgery} · {formatDate(selectedPatient.surgery_date)} · <strong style={{ color:'#0ea5e9' }}>POD {daysSince(selectedPatient.surgery_date)}</strong></div>
                </div>
                <button className="btn btn-blue" onClick={() => { setAddSiteForm({ name:'', location:'' }); setView('addSite') }}>+ เพิ่มตำแหน่งแผล</button>
              </div>
            </div>
            {patientSites.length === 0 ? (
              <div className="card" style={{ padding:52, textAlign:'center', color:'#475569' }}>
                <div style={{ fontSize:44, marginBottom:12 }}>📍</div>
                <div style={{ fontSize:15, fontWeight:600 }}>ยังไม่มีตำแหน่งแผล</div>
                <div style={{ fontSize:13, marginTop:8 }}>กด "+ เพิ่มตำแหน่งแผล" เพื่อเริ่มบันทึก</div>
              </div>
            ) : (
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(230px,1fr))', gap:15 }}>
                {patientSites.map((site, idx) => {
                  const recs = records[site.id] || []
                  const latest = recs[recs.length-1]
                  const color = sc(idx)
                  return (
                    <div key={site.id} className="card hoverable" style={{ overflow:'hidden' }} onClick={() => { setSelectedSite(site); setCompareMode({a:null,b:null}); setView('site') }}>
                      <div style={{ height:140, background:latest?'none':`linear-gradient(135deg,${color}18,${color}08)`, position:'relative', overflow:'hidden' }}>
                        {latest ? <img src={latest.imageUrl} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} /> :
                          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', color, opacity:.45 }}>
                            <div style={{ fontSize:30 }}>📷</div><div style={{ fontSize:12, marginTop:5 }}>ยังไม่มีภาพ</div>
                          </div>}
                        <div style={{ position:'absolute', top:9, left:9 }}>
                          <span style={{ background:color, color:'#fff', borderRadius:8, padding:'3px 10px', fontSize:12, fontWeight:700 }}>{site.name}</span>
                        </div>
                        {latest && <div style={{ position:'absolute', bottom:9, right:9 }}>
                          <span className="badge" style={{ background:getStatus(latest.status).color+'cc', color:'#fff' }}>{getStatus(latest.status).label}</span>
                        </div>}
                      </div>
                      <div style={{ padding:'11px 14px' }}>
                        {site.location && <div style={{ fontSize:12, color:'#64748b', marginBottom:4 }}>📍 {site.location}</div>}
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                          <span style={{ fontSize:12, color:'#94a3b8' }}>{recs.length} ภาพ</span>
                          {latest && <span style={{ fontSize:12, color:'#64748b' }}>ล่าสุด POD {latest.day}</span>}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ══ ADD SITE ══ */}
        {view === 'addSite' && selectedPatient && (
          <div style={{ maxWidth:480, margin:'0 auto' }}>
            <div className="card" style={{ padding:'26px 24px' }}>
              <div style={{ fontWeight:700, fontSize:17, marginBottom:20 }}>📍 เพิ่มตำแหน่งแผลใหม่</div>
              <div style={{ marginBottom:14 }}>
                <label style={{ fontSize:13, color:'#94a3b8', marginBottom:7, display:'block' }}>ชื่อตำแหน่งแผล *</label>
                <input placeholder="เช่น แผลหน้าท้อง, trocar site 1..." value={addSiteForm.name} onChange={e=>setAddSiteForm(f=>({...f,name:e.target.value}))} />
              </div>
              <div style={{ marginBottom:24 }}>
                <label style={{ fontSize:13, color:'#94a3b8', marginBottom:7, display:'block' }}>ตำแหน่งกายวิภาค</label>
                <input placeholder="เช่น RLQ, epigastric, umbilical..." value={addSiteForm.location} onChange={e=>setAddSiteForm(f=>({...f,location:e.target.value}))} />
              </div>
              <div style={{ display:'flex', gap:11 }}>
                <button className="btn btn-blue" style={{ flex:1 }} disabled={!addSiteForm.name.trim()||saving} onClick={addSite}>{saving?'⏳...':'เพิ่มตำแหน่งแผล'}</button>
                <button className="btn btn-ghost" onClick={()=>setView('patient')}>ยกเลิก</button>
              </div>
            </div>
          </div>
        )}

        {/* ══ EDIT SITE ══ */}
        {view === 'editSite' && editingSite && (
          <div style={{ maxWidth:480, margin:'0 auto' }}>
            <div className="card" style={{ padding:'26px 24px' }}>
              <div style={{ fontWeight:700, fontSize:17, marginBottom:20 }}>✏️ แก้ไขตำแหน่งแผล</div>
              <div style={{ marginBottom:14 }}>
                <label style={{ fontSize:13, color:'#94a3b8', marginBottom:7, display:'block' }}>ชื่อตำแหน่งแผล *</label>
                <input value={editSiteForm.name} onChange={e=>setEditSiteForm(f=>({...f,name:e.target.value}))} />
              </div>
              <div style={{ marginBottom:24 }}>
                <label style={{ fontSize:13, color:'#94a3b8', marginBottom:7, display:'block' }}>ตำแหน่งกายวิภาค</label>
                <input value={editSiteForm.location} onChange={e=>setEditSiteForm(f=>({...f,location:e.target.value}))} />
              </div>
              <div style={{ display:'flex', gap:11 }}>
                <button className="btn btn-blue" style={{ flex:1 }} disabled={!editSiteForm.name.trim()||saving} onClick={updateSite}>{saving?'⏳...':'บันทึก'}</button>
                <button className="btn btn-ghost" onClick={()=>{ setEditingSite(null); setView('site') }}>ยกเลิก</button>
              </div>
            </div>
          </div>
        )}

        {/* ══ SITE DETAIL ══ */}
        {view === 'site' && selectedSite && selectedPatient && (
          <div>
            {(() => {
              const idx = patientSites.findIndex(s=>s.id===selectedSite.id)
              const color = sc(idx)
              return (
                <div className="card" style={{ padding:'15px 20px', marginBottom:20, borderLeft:`4px solid ${color}` }}>
                  <div style={{ display:'flex', alignItems:'center', gap:14, flexWrap:'wrap' }}>
                    <div style={{ flex:1 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
                        <span style={{ background:color, color:'#fff', borderRadius:8, padding:'4px 12px', fontSize:14, fontWeight:700 }}>{selectedSite.name}</span>
                        {selectedSite.location && <span style={{ fontSize:13, color:'#64748b' }}>📍 {selectedSite.location}</span>}
                        <button className="btn btn-ghost" style={{ fontSize:11, padding:'3px 10px' }} onClick={() => { setEditSiteForm({ name:selectedSite.name, location:selectedSite.location||'' }); setEditingSite(selectedSite); setView('editSite') }}>✏️ แก้ไขตำแหน่ง</button>
                      </div>
                      <div style={{ fontSize:12, color:'#64748b', marginTop:6 }}>{selectedPatient.name} · {siteRecords.length} ภาพ</div>
                    </div>
                    <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
                      <button className="btn btn-blue" onClick={() => { setUploadForm({status:'normal',note:'',imageUrl:null,file:null}); setView('upload') }}>+ บันทึกภาพวันนี้</button>
                      {siteRecords.length >= 2 && <button className="btn btn-ghost" onClick={() => { setCompareMode({a:null,b:null}); setView('compare') }}>🔍 เปรียบเทียบ</button>}
                      {siteRecords.length > 0 && !selectMode && <button className="btn btn-ghost" style={{ color:'#34d399' }} onClick={() => { setSelectMode(true); setSelectedIds(new Set()) }}>📤 ส่งออกภาพ</button>}
                      {selectMode && <>
                        <button className="btn btn-ghost" style={{ fontSize:12 }} onClick={() => selectedIds.size===siteRecords.length ? setSelectedIds(new Set()) : setSelectedIds(new Set(siteRecords.map(r=>r.id)))}>
                          {selectedIds.size===siteRecords.length ? 'ยกเลิกทั้งหมด' : 'เลือกทั้งหมด'}
                        </button>
                        <button className="btn btn-blue" disabled={selectedIds.size===0} onClick={() => handleExport(selectedIds)}>ส่งออก ({selectedIds.size})</button>
                        <button className="btn btn-ghost" onClick={() => { setSelectMode(false); setSelectedIds(new Set()) }}>ยกเลิก</button>
                      </>}
                    </div>
                  </div>
                </div>
              )
            })()}

            {siteRecords.length === 0 ? (
              <div className="card" style={{ padding:52, textAlign:'center', color:'#475569' }}>
                <div style={{ fontSize:40, marginBottom:12 }}>📷</div>
                <div style={{ fontSize:15, fontWeight:600 }}>ยังไม่มีภาพแผล</div>
                <div style={{ fontSize:13, marginTop:8 }}>กด "+ บันทึกภาพวันนี้" เพื่อเริ่มต้น</div>
              </div>
            ) : (() => {
              const SHIFT_ORDER = ['morning','afternoon','night','']
              const SHIFT_INFO = {
                morning:   { label:'🌅 เวรเช้า',   bg:'rgba(234,179,8,0.12)',   color:'#ca8a04',  border:'rgba(234,179,8,0.3)'   },
                afternoon: { label:'🌤️ เวรบ่าย',  bg:'rgba(14,165,233,0.12)',  color:'#0ea5e9',  border:'rgba(14,165,233,0.3)'  },
                night:     { label:'🌙 เวรดึก',    bg:'rgba(99,102,241,0.12)',  color:'#818cf8',  border:'rgba(99,102,241,0.3)'  },
                '':        { label:'ไม่ระบุเวร',   bg:'rgba(255,255,255,0.04)', color:'#64748b',  border:'rgba(255,255,255,0.1)' },
              }
              const grouped = {}
              siteRecords.forEach(r => { if(!grouped[r.date]) grouped[r.date]=[]; grouped[r.date].push(r) })
              const sortedDates = Object.keys(grouped).sort((a,b)=>b.localeCompare(a))
              return (
                <div style={{ display:'flex', flexDirection:'column', gap:28 }}>
                  {sortedDates.map(date => {
                    const dayRecs = grouped[date]
                    // group by shift
                    const byShift = {}
                    dayRecs.forEach(r => {
                      const k = r.shift||''
                      if(!byShift[k]) byShift[k]=[]
                      byShift[k].push(r)
                    })
                    return (
                      <div key={date}>
                        {/* Day header */}
                        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16 }}>
                          <div style={{ background:'linear-gradient(135deg,#0ea5e9,#6366f1)', borderRadius:10, padding:'6px 14px', fontWeight:700, fontSize:13 }}>POD {dayRecs[0].day}</div>
                          <div style={{ fontWeight:700, fontSize:15 }}>{formatDate(date)}</div>
                          <div style={{ flex:1, height:1, background:'rgba(255,255,255,0.08)' }} />
                          <div style={{ fontSize:12, color:'#64748b' }}>{dayRecs.length} ภาพ</div>
                        </div>
                        {/* Shift groups */}
                        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                          {SHIFT_ORDER.filter(sh => byShift[sh]?.length > 0).map(sh => {
                            const shiftRecs = byShift[sh]
                            const si = SHIFT_INFO[sh]
                            return (
                              <div key={sh} style={{ border:`1px solid ${si.border}`, borderRadius:12, overflow:'hidden' }}>
                                {/* Shift header */}
                                <div style={{ background:si.bg, padding:'8px 14px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                                  <span style={{ fontWeight:700, fontSize:13, color:si.color }}>{si.label}</span>
                                  <span style={{ fontSize:12, color:'#64748b' }}>{shiftRecs.length} ภาพ</span>
                                </div>
                                {/* Photos */}
                                <div style={{ padding:'12px', display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(175px,1fr))', gap:12 }}>
                                  {shiftRecs.map(rec => {
                                    const isChosen = selectedIds.has(rec.id)
                                    const photoNum = siteRecords.findIndex(r=>r.id===rec.id)+1
                                    return (
                                      <div key={rec.id} className="card" style={{ overflow:'hidden', border:isChosen?'2px solid #0ea5e9':'2px solid transparent', transition:'border .15s' }}
                                        onClick={() => selectMode ? (isChosen ? setSelectedIds(s=>{const n=new Set(s);n.delete(rec.id);return n}) : setSelectedIds(s=>new Set([...s,rec.id]))) : setLightboxImg(rec.imageUrl)}>
                                        <div style={{ position:'relative' }}>
                                          <img src={rec.imageUrl} alt="wound" style={{ width:'100%', height:145, objectFit:'cover', display:'block', cursor:'pointer', opacity:selectMode&&!isChosen?.6:1 }} />
                                          <div style={{ position:'absolute', top:8, left:8, background:'rgba(15,23,42,0.75)', borderRadius:6, padding:'2px 8px', fontSize:11, color:'#fff', fontWeight:700 }}>ภาพที่ {photoNum}</div>
                                          <div style={{ position:'absolute', bottom:8, left:8 }}>
                                            <div style={{ background:'rgba(0,0,0,0.65)', borderRadius:6, padding:'2px 8px', fontSize:12, color:'#fff', fontWeight:600 }}>🕐 {rec.time||'--:--'}</div>
                                          </div>
                                          {selectMode && <div style={{ position:'absolute', top:8, right:8, width:26, height:26, borderRadius:'50%', background:isChosen?'#0ea5e9':'rgba(0,0,0,0.4)', border:'2px solid '+(isChosen?'#0ea5e9':'#fff'), display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, color:'#fff', fontWeight:700 }}>{isChosen?'✓':''}</div>}
                                        </div>
                                        <div style={{ padding:'9px 12px' }}>
                                          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                                            <span className="badge" style={{ background:getStatus(rec.status).color+'22', color:getStatus(rec.status).color }}>{getStatus(rec.status).label}</span>
                                            {!selectMode && (
                                              <div style={{ display:'flex', gap:6 }}>
                                                <button className="btn btn-ghost" style={{ fontSize:10, padding:'2px 8px' }}
                                                  onClick={e=>{ e.stopPropagation(); setEditRecForm({status:rec.status,note:rec.note||'',date:rec.date,shift:rec.shift||'',newImageUrl:null,newFile:null}); setEditingRecord(rec) }}>✏️</button>
                                                <button className="btn btn-ghost" style={{ fontSize:10, padding:'2px 8px', color:'#f87171', borderColor:'rgba(239,68,68,.25)' }}
                                                  onClick={e=>{ e.stopPropagation(); setConfirmDeleteRec(rec) }}>🗑️</button>
                                              </div>
                                            )}
                                          </div>
                                          {rec.note && <div style={{ fontSize:12, color:'#94a3b8', marginTop:5, lineHeight:1.5 }}>{rec.note}</div>}
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

        {/* ══ UPLOAD ══ */}
        {view === 'upload' && selectedSite && selectedPatient && (
          <div style={{ maxWidth:500, margin:'0 auto' }}>
            <div className="card" style={{ padding:'24px 24px' }}>
              <div style={{ fontWeight:700, fontSize:17, marginBottom:5 }}>📸 บันทึกภาพแผล</div>
              <div style={{ fontSize:13, color:'#94a3b8', marginBottom:18 }}>{selectedPatient.name} · <strong>{selectedSite.name}</strong> · POD {daysSince(selectedPatient.surgery_date)}</div>
              <div className="upload-zone" style={{ marginBottom:16 }} onClick={() => fileRef.current.click()}>
                {uploadForm.imageUrl ? <img src={uploadForm.imageUrl} alt="preview" style={{ width:'100%', height:'100%', objectFit:'cover' }} /> :
                  <><div style={{ fontSize:32, marginBottom:7 }}>📷</div><div style={{ fontSize:13, color:'#64748b' }}>แตะเพื่อเลือกหรือถ่ายภาพ</div></>}
                <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display:'none' }} onChange={handleImageChange} />
              </div>
              <div style={{ marginBottom:13 }}>
                <label style={{ fontSize:13, color:'#94a3b8', marginBottom:7, display:'block' }}>วันที่ถ่ายภาพ</label>
                <input type="date" value={uploadForm.date} onChange={e=>setUploadForm(f=>({...f,date:e.target.value}))} />
              </div>
              <div style={{ marginBottom:13 }}>
                <label style={{ fontSize:13, color:'#94a3b8', marginBottom:7, display:'block' }}>เวร</label>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
                  {[{v:'morning',l:'🌅 เวรเช้า'},{v:'afternoon',l:'🌤️ เวรบ่าย'},{v:'night',l:'🌙 เวรดึก'}].map(s=>(
                    <button key={s.v} type="button"
                      className="btn"
                      style={{ padding:'10px 0', fontSize:13, fontWeight:600,
                        background: uploadForm.shift===s.v ? 'linear-gradient(135deg,#0ea5e9,#0284c7)' : 'rgba(255,255,255,0.07)',
                        color: uploadForm.shift===s.v ? '#fff' : '#94a3b8',
                        border: uploadForm.shift===s.v ? 'none' : '1px solid rgba(255,255,255,0.1)'
                      }}
                      onClick={()=>setUploadForm(f=>({...f,shift:f.shift===s.v?'':s.v}))}>
                      {s.l}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ marginBottom:13 }}>
                <label style={{ fontSize:13, color:'#94a3b8', marginBottom:7, display:'block' }}>สถานะแผล</label>
                <select value={uploadForm.status} onChange={e=>setUploadForm(f=>({...f,status:e.target.value}))}>
                  {WOUND_STATUS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div style={{ marginBottom:20 }}>
                <label style={{ fontSize:13, color:'#94a3b8', marginBottom:7, display:'block' }}>หมายเหตุ</label>
                <textarea rows={3} placeholder="เช่น แผลแห้งดี ขอบแผลสนิทดี ไม่มีสิ่งคัดหลั่ง..." value={uploadForm.note} onChange={e=>setUploadForm(f=>({...f,note:e.target.value}))} style={{ resize:'none' }} />
              </div>
              <div style={{ display:'flex', gap:11 }}>
                <button className="btn btn-blue" style={{ flex:1 }} onClick={handleUpload} disabled={!uploadForm.file||saving}>{saving?'⏳ กำลังอัปโหลด...':'บันทึก'}</button>
                <button className="btn btn-ghost" onClick={()=>{ setUploadForm({status:'normal',note:'',imageUrl:null,file:null,date:new Date().toISOString().split('T')[0]}); setView('site') }}>ยกเลิก</button>
              </div>
            </div>
          </div>
        )}

        {/* ══ COMPARE ══ */}
        {view === 'compare' && selectedSite && (
          <div>
            <div style={{ marginBottom:16, display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:10 }}>
              <div>
                <div style={{ fontWeight:700, fontSize:17, marginBottom:4 }}>🔍 เปรียบเทียบภาพแผล</div>
                <div style={{ fontSize:13, color:'#64748b' }}>{selectedSite.name} · เลือก 2 ภาพ</div>
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <button className="btn btn-ghost" style={{ fontSize:12, padding:'6px 12px' }} onClick={()=>{ setSelectedSite(null); setView('patient') }}>← หน้าผู้ป่วย</button>
                <button className="btn btn-ghost" style={{ fontSize:12, padding:'6px 12px' }} onClick={()=>{ setSelectedPatient(null); setSelectedSite(null); setView('list') }}>🏠 หน้าหลัก</button>
              </div>
            </div>
            {compareMode.a && compareMode.b ? (
              <div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>
                  {[compareMode.a, compareMode.b].map((rec,i) => (
                    <div key={rec.id} className="card" style={{ overflow:'hidden' }}>
                      <div style={{ padding:'9px 14px', background:i===0?'rgba(14,165,233,.1)':'rgba(249,115,22,.1)', display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:4 }}>
                        <span style={{ fontWeight:700, fontSize:13, color:i===0?'#38bdf8':'#fb923c' }}>{i===0?'🔵':'🟠'} ภาพที่ {siteRecords.findIndex(r=>r.id===rec.id)+1} · POD {rec.day}</span>
                        <span className="badge" style={{ background:getStatus(rec.status).color+'22', color:getStatus(rec.status).color }}>{getStatus(rec.status).label}</span>
                      </div>
                      <img src={rec.imageUrl} alt="wound" style={{ width:'100%', height:230, objectFit:'cover', display:'block', cursor:'pointer' }} onClick={()=>setLightboxImg(rec.imageUrl)} />
                      <div style={{ padding:'10px 14px' }}>
                        <div style={{ display:'flex', justifyContent:'space-between' }}>
                          <div style={{ fontSize:12, color:'#64748b' }}>{formatDate(rec.date)}</div>
                          <div style={{ fontSize:12, color:'#e2e8f0', background:'rgba(0,0,0,0.3)', borderRadius:6, padding:'2px 8px', fontWeight:600 }}>🕐 {rec.time||'--:--'}</div>
                        </div>
                        {rec.note && <div style={{ fontSize:12, color:'#94a3b8', marginTop:4 }}>{rec.note}</div>}
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
                  <button className="btn btn-ghost" onClick={()=>setCompareMode({a:null,b:null})}>← เลือกใหม่</button>
                  <button className="btn btn-ghost" onClick={()=>setView('site')}>กลับหน้าแผล</button>
                </div>
              </div>
            ) : (
              <div>
                <div style={{ marginBottom:12, fontSize:13, color:'#94a3b8' }}>เลือกแล้ว {[compareMode.a,compareMode.b].filter(Boolean).length} / 2 ภาพ</div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(170px,1fr))', gap:12 }}>
                  {siteRecords.slice().reverse().map(rec => {
                    const isA=compareMode.a?.id===rec.id, isB=compareMode.b?.id===rec.id
                    const isSelected=isA||isB, canSelect=!isSelected&&!(compareMode.a&&compareMode.b)
                    return (
                      <div key={rec.id} className={`thumb ${isA?'sel-a':isB?'sel-b':''}`} style={{ opacity:!canSelect&&!isSelected?.45:1 }}
                        onClick={() => {
                          if(isSelected) setCompareMode(m=>({a:m.a?.id===rec.id?null:m.a,b:m.b?.id===rec.id?null:m.b}))
                          else if(canSelect) setCompareMode(m=>!m.a?{...m,a:rec}:{...m,b:rec})
                        }}>
                        <div style={{ position:'relative' }}>
                          <img src={rec.imageUrl} alt="wound" style={{ width:'100%', height:125, objectFit:'cover', display:'block' }} />
                          <div style={{ position:'absolute', top:6, left:6, background:'rgba(15,23,42,0.8)', borderRadius:5, padding:'2px 7px', fontSize:11, color:'#fff', fontWeight:700 }}>ภาพที่ {siteRecords.findIndex(r=>r.id===rec.id)+1}</div>
                        </div>
                        <div style={{ padding:'8px 10px', background:'rgba(0,0,0,.4)' }}>
                          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                            <div style={{ fontWeight:700, fontSize:12 }}>POD {rec.day}</div>
                            <div style={{ fontSize:11, color:'#94a3b8' }}>🕐 {rec.time||'--:--'}</div>
                          </div>
                          <div style={{ fontSize:11, color:'#64748b', marginTop:2 }}>{formatDate(rec.date)}</div>
                          <span className="badge" style={{ background:getStatus(rec.status).color+'22', color:getStatus(rec.status).color, marginTop:4, fontSize:11 }}>{getStatus(rec.status).label}</span>
                          {isSelected && <div style={{ fontSize:11, color:isA?'#38bdf8':'#fb923c', fontWeight:700, marginTop:3 }}>✓ {isA?'ฝั่งซ้าย':'ฝั่งขวา'}</div>}
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
      {editingRecord && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.85)', zIndex:998, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div className="card" style={{ maxWidth:440, width:'100%', padding:'24px 24px' }}>
            <div style={{ fontWeight:700, fontSize:17, marginBottom:18 }}>✏️ แก้ไขบันทึกภาพ</div>
            <div style={{ marginBottom:12, position:'relative' }}>
              <img src={editRecForm.newImageUrl || editingRecord.imageUrl} alt="wound" style={{ width:'100%', height:160, objectFit:'cover', borderRadius:10, display:'block' }} />
              <label style={{ position:'absolute', bottom:8, right:8, background:'rgba(14,165,233,0.9)', color:'#fff', borderRadius:8, padding:'4px 12px', fontSize:12, fontWeight:700, cursor:'pointer' }}>
                🔄 เปลี่ยนภาพ
                <input type="file" accept="image/*" capture="environment" style={{ display:'none' }} onChange={handleEditImageChange} />
              </label>
              {editRecForm.newImageUrl && (
                <div style={{ position:'absolute', top:8, left:8, background:'rgba(34,197,94,0.9)', color:'#fff', borderRadius:6, padding:'2px 8px', fontSize:11, fontWeight:700 }}>
                  ✓ ภาพใหม่
                </div>
              )}
            </div>
            <div style={{ marginBottom:13 }}>
              <label style={{ fontSize:13, color:'#94a3b8', marginBottom:7, display:'block' }}>วันที่</label>
              <input type="date" value={editRecForm.date} onChange={e=>setEditRecForm(f=>({...f,date:e.target.value}))} />
            </div>
            <div style={{ marginBottom:13 }}>
              <label style={{ fontSize:13, color:'#94a3b8', marginBottom:7, display:'block' }}>สถานะแผล</label>
              <select value={editRecForm.status} onChange={e=>setEditRecForm(f=>({...f,status:e.target.value}))}>
                {WOUND_STATUS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div style={{ marginBottom:20 }}>
              <label style={{ fontSize:13, color:'#94a3b8', marginBottom:7, display:'block' }}>หมายเหตุ</label>
              <textarea rows={3} value={editRecForm.note} onChange={e=>setEditRecForm(f=>({...f,note:e.target.value}))} style={{ resize:'none' }} placeholder="หมายเหตุ..." />
            </div>
            <div style={{ display:'flex', gap:11 }}>
              <button className="btn btn-blue" style={{ flex:1 }} disabled={saving} onClick={handleUpdateRecord}>{saving?'⏳...':'บันทึก'}</button>
              <button className="btn btn-ghost" onClick={()=>{ setEditingRecord(null); setEditRecForm({status:'normal',note:'',date:'',newImageUrl:null,newFile:null}) }}>ยกเลิก</button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM DELETE RECORD */}
      {confirmDeleteRec && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.75)', zIndex:998, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div className="card" style={{ maxWidth:380, width:'100%', padding:'24px 24px', textAlign:'center' }}>
            <div style={{ fontSize:32, marginBottom:12 }}>🗑️</div>
            <div style={{ fontWeight:700, fontSize:16, marginBottom:8 }}>ยืนยันการลบภาพ</div>
            <img src={confirmDeleteRec.imageUrl} alt="wound" style={{ width:'100%', height:140, objectFit:'cover', borderRadius:10, display:'block', marginBottom:12 }} />
            <div style={{ fontSize:13, color:'#94a3b8', marginBottom:8 }}>POD {confirmDeleteRec.day} · {formatDate(confirmDeleteRec.date)}</div>
            <div style={{ background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:10, padding:'10px 14px', marginBottom:18, fontSize:13, color:'#fca5a5' }}>
              ⚠️ ลบภาพนี้อย่างถาวร ไม่สามารถกู้คืนได้
            </div>
            <div style={{ display:'flex', gap:12 }}>
              <button className="btn" style={{ flex:1, background:'linear-gradient(135deg,#ef4444,#dc2626)', color:'#fff' }} onClick={()=>handleDeleteRecord(confirmDeleteRec)}>
                {saving?'⏳...':'ยืนยันลบ'}
              </button>
              <button className="btn btn-ghost" style={{ flex:1 }} onClick={()=>setConfirmDeleteRec(null)}>ยกเลิก</button>
            </div>
          </div>
        </div>
      )}

      {/* EXPORT MODAL */}
      {showExport && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.85)', zIndex:999, overflowY:'auto', padding:'20px 16px' }}>
          <div style={{ maxWidth:600, margin:'0 auto' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
              <div>
                <div style={{ fontWeight:700, fontSize:18 }}>📤 ส่งออกภาพแผล</div>
                <div style={{ fontSize:13, color:'#94a3b8', marginTop:3 }}>
                  {exportImages.length === 0 ? 'กำลังสร้างภาพ...' : `สร้างแล้ว ${exportImages.length} ภาพ · กดปุ่มด้านล่างเพื่อดาวน์โหลดพร้อมกัน`}
                </div>
              </div>
              <button className="btn btn-ghost" onClick={()=>setShowExport(false)}>✕ ปิด</button>
            </div>

            {/* ปุ่มดาวน์โหลดทั้งหมด */}
            {exportImages.length > 0 && (
              <div style={{ display:'flex', gap:10, marginBottom:16 }}>
                <button className="btn btn-blue" style={{ flex:2, fontSize:14, padding:'11px 0' }}
                  onClick={() => mergeAndDownload(exportImages)}>
                  📎 รวมเป็นไฟล์เดียว ({exportImages.length} ภาพ)
                </button>
                <button className="btn btn-ghost" style={{ flex:1, fontSize:13, padding:'11px 0' }}
                  onClick={() => {
                    exportImages.forEach((item, i) => {
                      setTimeout(() => {
                        const a = document.createElement('a')
                        a.href = item.url
                        a.download = `wound_POD${item.pod}_${selectedSite?.name}_${item.date}.jpg`
                        document.body.appendChild(a)
                        a.click()
                        document.body.removeChild(a)
                      }, i * 600)
                    })
                  }}>
                  ⬇️ แยกไฟล์
                </button>
              </div>
            )}

            {exportImages.length === 0 && <div style={{ textAlign:'center', padding:60, color:'#64748b' }}><div className="spinner" style={{ margin:'0 auto 16px' }} /><div>กำลังสร้างภาพ...</div></div>}
            <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
              {exportImages.map((item,i) => (
                <div key={item.date} className="card" style={{ overflow:'hidden' }}>
                  <div style={{ padding:'10px 14px', background:'rgba(14,165,233,0.1)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <span style={{ fontWeight:700, fontSize:13 }}>POD {item.pod} · {formatDate(item.date)}</span>
                    <a href={item.url} download={`wound_POD${item.pod}_${selectedSite?.name}_${item.date}.jpg`}
                      style={{ background:'rgba(14,165,233,0.2)', color:'#38bdf8', borderRadius:8, padding:'3px 12px', fontSize:12, fontWeight:700, textDecoration:'none' }}>
                      ⬇️
                    </a>
                  </div>
                  <img src={item.url} alt={`POD ${item.pod}`} style={{ width:'100%', display:'block' }} />
                </div>
              ))}
            </div>
            {exportImages.length > 0 && (
              <div style={{ marginTop:16, padding:'14px 16px', background:'rgba(14,165,233,0.08)', borderRadius:12, fontSize:13, color:'#94a3b8', lineHeight:1.8 }}>
                💡 <strong style={{ color:'#e2e8f0' }}>วิธีส่ง LINE:</strong><br/>
                1. กด <strong style={{color:'#e2e8f0'}}>📎 รวมเป็นไฟล์เดียว</strong> → ได้ภาพยาวๆ ไฟล์เดียวส่ง LINE ได้เลย<br/>
                2. เปิด LINE → เลือกแชทแพทย์ → แนบรูปจาก Camera Roll
              </div>
            )}
          </div>
        </div>
      )}

      {/* CONFIRM DELETE */}
      {confirmDelete && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.75)', zIndex:998, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div className="card" style={{ maxWidth:420, width:'100%', padding:'28px 24px' }}>
            <div style={{ fontSize:32, textAlign:'center', marginBottom:12 }}>🗑️</div>
            <div style={{ fontWeight:700, fontSize:17, textAlign:'center', marginBottom:8 }}>ยืนยันการลบผู้ป่วย</div>
            <div style={{ fontSize:14, color:'#94a3b8', textAlign:'center', marginBottom:4 }}><strong style={{ color:'#e2e8f0' }}>{confirmDelete.name}</strong></div>
            <div style={{ background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:10, padding:'12px 14px', marginTop:16, marginBottom:20, fontSize:13, color:'#fca5a5', lineHeight:1.7 }}>
              ⚠️ การลบจะลบข้อมูลผู้ป่วย ตำแหน่งแผล และภาพทั้งหมดอย่างถาวร
            </div>
            <div style={{ display:'flex', gap:12 }}>
              <button className="btn" style={{ flex:1, background:'linear-gradient(135deg,#ef4444,#dc2626)', color:'#fff' }} onClick={() => deletePatient(confirmDelete)}>
                {saving ? '⏳...' : 'ยืนยันลบ'}
              </button>
              <button className="btn btn-ghost" style={{ flex:1 }} onClick={()=>setConfirmDelete(null)}>ยกเลิก</button>
            </div>
          </div>
        </div>
      )}

      {/* LIGHTBOX */}
      {lightboxImg && (
        <div className="lightbox" onClick={()=>setLightboxImg(null)}>
          <img src={lightboxImg} alt="fullsize" />
        </div>
      )}

      {/* TOAST */}
      {toast && (
        <div style={{ position:'fixed', bottom:24, left:'50%', transform:'translateX(-50%)', background:'#1e293b', border:'1px solid rgba(255,255,255,.1)', borderRadius:12, padding:'10px 20px', fontSize:14, fontWeight:600, zIndex:1000, boxShadow:'0 4px 20px rgba(0,0,0,.4)' }}>
          {toast}
        </div>
      )}
    </div>
  )
}
