import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';
const corsHeaders = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json'};
const respond=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:corsHeaders});
Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:corsHeaders});
  if(req.method!=='POST')return respond({error:'Method not allowed.'},405);
  const supabaseUrl=Deno.env.get('SUPABASE_URL'),serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),publicKey=Deno.env.get('VAPID_PUBLIC_KEY'),privateKey=Deno.env.get('VAPID_PRIVATE_KEY');
  if(!supabaseUrl||!serviceKey||!publicKey||!privateKey)return respond({error:'Push service is not configured.'},503);
  const authorization=req.headers.get('Authorization')??'',token=authorization.startsWith('Bearer ')?authorization.slice(7):'';
  if(!token)return respond({error:'Sign in to send an order notification.'},401);
  const admin=createClient(supabaseUrl,serviceKey,{auth:{autoRefreshToken:false,persistSession:false}});
  try{
    const {data:authData,error:authError}=await admin.auth.getUser(token),user=authData.user;
    if(authError||!user)return respond({error:'Your session is invalid. Sign in again.'},401);
    const body=await req.json().catch(()=>({})),messageId=typeof body.message_id==='string'?body.message_id:'',eventId=typeof body.event_id==='string'?body.event_id:'';
    if((!messageId&&!eventId)||(messageId&&eventId))return respond({error:'A message or order event is required.'},400);
    let orderId='',recipientId='',title='',message='',url='/activity',tag='';
    if(messageId){
      const {data:chatMessage,error}=await admin.from('order_chat_messages').select('id,order_id,sender_id,body').eq('id',messageId).maybeSingle();
      if(error)throw error;
      if(!chatMessage||chatMessage.sender_id!==user.id)return respond({error:'You cannot notify from this message.'},403);
      orderId=chatMessage.order_id;
      const {data:order,error:orderError}=await admin.from('orders').select('id,public_order_number,buyer_id,vendor_id,vendor:vendors(profile_id,shop_name)').eq('id',orderId).maybeSingle();
      if(orderError)throw orderError;if(!order)return respond({error:'Order not found.'},404);
      const vendor=Array.isArray(order.vendor)?order.vendor[0]:order.vendor,sellerId=vendor?.profile_id;
      if(order.buyer_id===user.id){recipientId=sellerId||'';title='New message from a buyer';message=chatMessage.body.slice(0,120)+' · '+order.public_order_number;}
      else if(sellerId===user.id){recipientId=order.buyer_id;title='Message from '+(vendor?.shop_name||'the seller');message=chatMessage.body.slice(0,120)+' · '+order.public_order_number;}
      else return respond({error:'You are not part of this order.'},403);
      url='/?order_chat='+encodeURIComponent(orderId);tag='tradr-chat-'+orderId;
    }else{
      const {data:event,error}=await admin.from('order_events').select('id,order_id,actor_user_id,actor_type,event_type,to_status,public_message').eq('id',eventId).maybeSingle();
      if(error)throw error;if(!event)return respond({error:'Order update not found.'},404);
      orderId=event.order_id;
      const {data:order,error:orderError}=await admin.from('orders').select('id,public_order_number,buyer_id,vendor_id,vendor:vendors(profile_id,shop_name)').eq('id',orderId).maybeSingle();
      if(orderError)throw orderError;if(!order)return respond({error:'Order not found.'},404);
      const vendor=Array.isArray(order.vendor)?order.vendor[0]:order.vendor,sellerId=vendor?.profile_id;
      if(event.event_type==='payment_succeeded'&&order.buyer_id===user.id){recipientId=sellerId||'';title='New paid order';message='Order '+order.public_order_number+' has been paid. Open your shop to accept it.';}
      else if(event.actor_user_id===user.id&&event.actor_type==='seller'){recipientId=order.buyer_id;title='Your order has an update';message=event.public_message||(event.to_status==='accepted'?'The seller accepted your order.':event.to_status==='preparing'?'The seller is preparing your order.':event.to_status==='ready_for_handover'?'Your order is ready for handover.':event.to_status==='delivered'?'The seller marked your order as delivered.':'Order '+order.public_order_number+' was updated.');}
      else if(event.actor_user_id===user.id&&event.actor_type==='buyer'){recipientId=sellerId||'';title='Buyer confirmed receipt';message='The buyer confirmed receipt of order '+order.public_order_number+'.';}
      else return respond({error:'You cannot notify from this order update.'},403);
      url='/?order_chat='+encodeURIComponent(orderId);tag='tradr-order-'+orderId+'-'+event.id;
    }
    if(!recipientId||recipientId===user.id)return respond({success:true,sent:0});
    const {data:subscriptions,error:subscriptionError}=await admin.from('push_subscriptions').select('id,endpoint,p256dh,auth').eq('user_id',recipientId);
    if(subscriptionError)throw subscriptionError;
    webpush.setVapidDetails('mailto:support@tradrr.store',publicKey,privateKey);
    let sent=0,failed=0,removed=0;
    await Promise.all((subscriptions||[]).map(async subscription=>{
      try{
        await webpush.sendNotification({endpoint:subscription.endpoint,keys:{p256dh:subscription.p256dh,auth:subscription.auth}},JSON.stringify({title,body:message,url,tag,renotify:true}),{urgency:'high',TTL:3600});sent++;
      }catch(error){
        const statusCode=(error as {statusCode?:number}).statusCode;
        if(statusCode===404||statusCode===410){await admin.from('push_subscriptions').delete().eq('id',subscription.id);removed++;}
        else{failed++;console.error('Order push failed:',statusCode??'unknown');}
      }
    }));
    return respond({success:true,sent,failed,removed});
  }catch(error){console.error('notify-order-chat failed:',error instanceof Error?error.message:'unknown error');return respond({error:'Could not send the order notification.'},500);}
});
