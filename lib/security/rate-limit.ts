import { sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { rateLimits } from "@/lib/db/schema"

export class RateLimitError extends Error{
  status=429
  constructor(public retryAfterSeconds:number,message="Muitas tentativas. Aguarde antes de tentar novamente."){
    super(message)
  }
}

export async function consumeRateLimit(key:string,options:{max:number;windowSeconds:number}){
  const now=Date.now()
  const threshold=now-options.windowSeconds*1000
  const rows=await db.insert(rateLimits).values({
    id:crypto.randomUUID(),
    key,
    count:1,
    lastRequest:now,
  }).onConflictDoUpdate({
    target:rateLimits.key,
    set:{
      count:sql<number>`CASE WHEN ${rateLimits.lastRequest} < ${threshold} THEN 1 ELSE ${rateLimits.count} + 1 END`,
      lastRequest:sql<number>`CASE WHEN ${rateLimits.lastRequest} < ${threshold} THEN ${now} ELSE ${rateLimits.lastRequest} END`,
    },
  }).returning({count:rateLimits.count,lastRequest:rateLimits.lastRequest})

  const row=rows[0]
  if(row&&row.count>options.max){
    const elapsed=Math.max(0,Math.floor((now-row.lastRequest)/1000))
    throw new RateLimitError(Math.max(1,options.windowSeconds-elapsed))
  }
}
