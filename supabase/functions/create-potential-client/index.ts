import { withSupabase } from 'npm:@supabase/server@^1'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const FROM_EMAIL = Deno.env.get('CLIENT_WELCOME_FROM_EMAIL') || Deno.env.get('DOCUMENT_FROM_EMAIL') || 'Nicole Platten Accounting <documents@nicoleplattenaccounting.co.uk>'
const LOGIN_URL = Deno.env.get('PORTAL_LOGIN_URL') || 'https://nicoleplattenaccounting.co.uk/client-login.html'

function temporaryPassword(){
  const bytes = new Uint8Array(9)
  crypto.getRandomValues(bytes)
  const token = Array.from(bytes).map(b=>b.toString(16).padStart(2,'0')).join('').slice(0,14)
  return `Npa!${token}A7`
}

function esc(value=''){
  return String(value).replace(/[&<>"']/g,c=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c] || c))
}

export default {
  fetch: withSupabase({auth:'user'}, async (req,ctx)=>{
    if(req.method!=='POST') return Response.json({error:'Method not allowed'},{status:405})

    const {data:me}=await ctx.supabase.from('profiles').select('role').eq('id',ctx.userClaims?.sub).single()
    if(me?.role!=='admin') return Response.json({error:'Forbidden'},{status:403})

    const body=await req.json().catch(()=>({}))
    const name=String(body.name||'').trim()
    const email=String(body.email||'').trim().toLowerCase()
    const businessName=String(body.businessName||'').trim()
    const discussion=String(body.discussion||'').trim()
    if(!name || !email || !email.includes('@')) return Response.json({error:'Please enter a valid name and email address.'},{status:400})
    if(!RESEND_API_KEY) return Response.json({error:'Email service is not configured. Add RESEND_API_KEY to Supabase Edge Function secrets.'},{status:500})

    const password=temporaryPassword()
    const {data:userData,error:userError}=await ctx.supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm:true,
      user_metadata:{full_name:name}
    })
    if(userError) return Response.json({error:userError.message},{status:400})

    const id=userData.user.id
    const {error:profileError}=await ctx.supabaseAdmin.from('profiles').insert({
      id,
      email,
      login_email:email,
      full_name:name,
      business_name:businessName||null,
      role:'client',
      client_status:'onboarding',
      portal_tier:'potential',
      potential_discussion:discussion||null,
      must_change_password:true
    })
    if(profileError){
      await ctx.supabaseAdmin.auth.admin.deleteUser(id)
      return Response.json({error:profileError.message},{status:400})
    }

    // Keep compatibility with the original portal record model.
    const {error:recordError}=await ctx.supabaseAdmin.from('client_records').insert({
      user_id:id,
      client_name:name,
      service:discussion||'Potential client — portal preview',
      status:'Potential client',
      progress:0,
      current_stage:'Initial discussions',
      next_action:'Discuss your accountancy package with Nicole'
    })
    if(recordError){
      await ctx.supabaseAdmin.auth.admin.deleteUser(id)
      return Response.json({error:recordError.message},{status:400})
    }

    const subject='Your Nicole Platten Accounting portal preview'
    const discussionLine=discussion ? `\nCurrent discussion: ${discussion}\n` : ''
    const text=`Hi ${name},

Thank you for your current interest and for the discussions you have had with Nicole about your accountancy needs.

Nicole has created preview access to the Nicole Platten Accounting client portal for you. The portal is designed to make working together simple and transparent. Full clients can use it to follow the progress of their accountancy work, see upcoming deadlines and reminders, respond to document requests and keep important updates together in one place.${discussionLine}
Your current login gives you a preview of that experience while you decide on the right package with Nicole. Once a package is agreed, Nicole can upgrade this same login to the full client portal — there is no need to create another account.

Your login details
Email: ${email}
Temporary password: ${password}
Sign in: ${LOGIN_URL}

For security, you will be asked to choose your own password the first time you sign in.

We hope you enjoy having a look around, and Nicole looks forward to hopefully working with you.

Nicole Platten Accounting`

    const html=`
      <div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#33291f;line-height:1.65">
        <div style="padding:24px 0;border-bottom:1px solid #eaded2"><strong style="font-size:20px">Nicole Platten Accounting</strong></div>
        <div style="padding:28px 0">
          <p>Hi ${esc(name)},</p>
          <p>Thank you for your current interest and for the discussions you have had with Nicole about your accountancy needs.</p>
          <p>Nicole has created <strong>preview access</strong> to the Nicole Platten Accounting client portal for you. The portal is designed to make working together simple and transparent. Full clients can follow the progress of their accountancy work, see upcoming deadlines and reminders, respond to document requests and keep important updates together in one place.</p>
          ${discussion?`<div style="background:#f7efe7;border:1px solid #eaded2;border-radius:12px;padding:14px 16px;margin:18px 0"><small style="text-transform:uppercase;letter-spacing:.08em;color:#6f5947;font-weight:bold">Current discussion</small><br><strong>${esc(discussion)}</strong></div>`:''}
          <p>Your current login gives you a preview of that experience while you decide on the right package with Nicole. Once a package is agreed, Nicole can upgrade this same login to the <strong>full client portal</strong> — there is no need to create another account.</p>
          <div style="background:#33291f;color:white;border-radius:14px;padding:18px;margin:22px 0">
            <div><small style="color:#d9bea8">LOGIN EMAIL</small><br><strong>${esc(email)}</strong></div>
            <div style="margin-top:12px"><small style="color:#d9bea8">TEMPORARY PASSWORD</small><br><strong>${esc(password)}</strong></div>
          </div>
          <p><a href="${esc(LOGIN_URL)}" style="display:inline-block;background:#6f5947;color:white;text-decoration:none;border-radius:999px;padding:12px 18px;font-weight:bold">Open your portal preview</a></p>
          <p style="font-size:13px;color:#6e6258">For security, you will be asked to choose your own password the first time you sign in.</p>
          <p>We hope you enjoy having a look around, and Nicole looks forward to hopefully working with you.</p>
          <p><strong>Nicole Platten Accounting</strong></p>
        </div>
      </div>`

    const emailRes=await fetch('https://api.resend.com/emails',{
      method:'POST',
      headers:{'Content-Type':'application/json',Authorization:`Bearer ${RESEND_API_KEY}`},
      body:JSON.stringify({from:FROM_EMAIL,to:[email],subject,text,html})
    })
    if(!emailRes.ok){
      const provider=await emailRes.text().catch(()=> '')
      await ctx.supabaseAdmin.auth.admin.deleteUser(id)
      return Response.json({error:'The welcome email could not be delivered, so the preview account was not kept.',detail:provider},{status:502})
    }

    return Response.json({ok:true,id})
  })
}
