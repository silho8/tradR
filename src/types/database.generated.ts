
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {

  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "admin_users": {
                  Row: {
                    "created_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"user_id"?: string
                  }
                  Relationships: [

                  ]
                },"cart_items": {
                  Row: {
                    "cart_id": string,"created_at": string,"id": string,"listing_id": string,"quantity": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cart_id": string,"created_at"?: string,"id"?: string,"listing_id": string,"quantity": number,"updated_at"?: string
                  }
                  Update: {
                    "cart_id"?: string,"created_at"?: string,"id"?: string,"listing_id"?: string,"quantity"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "cart_items_cart_id_fkey"
      columns: ["cart_id"]
isOneToOne: false
      referencedRelation: "carts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cart_items_listing_id_fkey"
      columns: ["listing_id"]
isOneToOne: false
      referencedRelation: "listings"
      referencedColumns: ["id"]
    }
                  ]
                },"carts": {
                  Row: {
                    "buyer_id": string,"created_at": string,"id": string,"shop_id": string,"status": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "buyer_id": string,"created_at"?: string,"id"?: string,"shop_id": string,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "buyer_id"?: string,"created_at"?: string,"id"?: string,"shop_id"?: string,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "carts_buyer_id_fkey"
      columns: ["buyer_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "carts_shop_id_fkey"
      columns: ["shop_id"]
isOneToOne: false
      referencedRelation: "vendors"
      referencedColumns: ["id"]
    }
                  ]
                },"daily_push_messages": {
                  Row: {
                    "body": string,"enabled": boolean,"title": string,"updated_at": string,"weekday": number
                  }
                  ComputedFields: never
                  Insert: {
                    "body": string,"enabled"?: boolean,"title": string,"updated_at"?: string,"weekday": number
                  }
                  Update: {
                    "body"?: string,"enabled"?: boolean,"title"?: string,"updated_at"?: string,"weekday"?: number
                  }
                  Relationships: [

                  ]
                },"deliveries": {
                  Row: {
                    "assigned_agent_id": string | null,"created_at": string,"delivered_at": string | null,"destination_snapshot": NonNullable<Json>,"dispatch_at": string | null,"fee_kobo": number,"id": string,"method": string,"order_id": string,"pickup_note": string | null,"proof_reference": string | null,"status": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "assigned_agent_id"?: string | null,"created_at"?: string,"delivered_at"?: string | null,"destination_snapshot": NonNullable<Json>,"dispatch_at"?: string | null,"fee_kobo"?: number,"id"?: string,"method": string,"order_id": string,"pickup_note"?: string | null,"proof_reference"?: string | null,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "assigned_agent_id"?: string | null,"created_at"?: string,"delivered_at"?: string | null,"destination_snapshot"?: NonNullable<Json>,"dispatch_at"?: string | null,"fee_kobo"?: number,"id"?: string,"method"?: string,"order_id"?: string,"pickup_note"?: string | null,"proof_reference"?: string | null,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "deliveries_assigned_agent_id_fkey"
      columns: ["assigned_agent_id"]
isOneToOne: false
      referencedRelation: "delivery_agents"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "deliveries_order_id_fkey"
      columns: ["order_id"]
isOneToOne: true
      referencedRelation: "orders"
      referencedColumns: ["id"]
    }
                  ]
                },"delivery_agents": {
                  Row: {
                    "created_at": string,"display_name": string,"id": string,"phone": string,"status": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"display_name": string,"id"?: string,"phone": string,"status"?: string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"display_name"?: string,"id"?: string,"phone"?: string,"status"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "delivery_agents_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"delivery_verifications": {
                  Row: {
                    "attempts": number,"code_hash": string,"created_at": string,"delivery_id": string,"expires_at": string,"id": string,"max_attempts": number,"used_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "attempts"?: number,"code_hash": string,"created_at"?: string,"delivery_id": string,"expires_at": string,"id"?: string,"max_attempts"?: number,"used_at"?: string | null
                  }
                  Update: {
                    "attempts"?: number,"code_hash"?: string,"created_at"?: string,"delivery_id"?: string,"expires_at"?: string,"id"?: string,"max_attempts"?: number,"used_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "delivery_verifications_delivery_id_fkey"
      columns: ["delivery_id"]
isOneToOne: false
      referencedRelation: "deliveries"
      referencedColumns: ["id"]
    }
                  ]
                },"listing_subscriptions": {
                  Row: {
                    "amount_ngn": number,"created_at": string,"expires_at": string | null,"id": string,"listing_id": string,"starts_at": string | null,"status": string,"vendor_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_ngn"?: number,"created_at"?: string,"expires_at"?: string | null,"id"?: string,"listing_id": string,"starts_at"?: string | null,"status": string,"vendor_id": string
                  }
                  Update: {
                    "amount_ngn"?: number,"created_at"?: string,"expires_at"?: string | null,"id"?: string,"listing_id"?: string,"starts_at"?: string | null,"status"?: string,"vendor_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "listing_subscriptions_listing_id_fkey"
      columns: ["listing_id"]
isOneToOne: false
      referencedRelation: "listings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "listing_subscriptions_vendor_id_fkey"
      columns: ["vendor_id"]
isOneToOne: false
      referencedRelation: "vendors"
      referencedColumns: ["id"]
    }
                  ]
                },"listings": {
                  Row: {
                    "category": string,"created_at": string,"description": string,"id": string,"image_urls": (string)[],"moderation_status": string,"price_ngn": number,"reviewed_at": string | null,"reviewed_by": string | null,"search_document": unknown,"status": string,"stock_quantity": number | null,"title": string,"updated_at": string,"vendor_id": string,"visible_until": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "category": string,"created_at"?: string,"description": string,"id"?: string,"image_urls"?: (string)[],"moderation_status"?: string,"price_ngn": number,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"search_document"?: never,"status"?: string,"stock_quantity"?: number | null,"title": string,"updated_at"?: string,"vendor_id": string,"visible_until"?: string | null
                  }
                  Update: {
                    "category"?: string,"created_at"?: string,"description"?: string,"id"?: string,"image_urls"?: (string)[],"moderation_status"?: string,"price_ngn"?: number,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"search_document"?: never,"status"?: string,"stock_quantity"?: number | null,"title"?: string,"updated_at"?: string,"vendor_id"?: string,"visible_until"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "listings_vendor_id_fkey"
      columns: ["vendor_id"]
isOneToOne: false
      referencedRelation: "vendors"
      referencedColumns: ["id"]
    }
                  ]
                },"marketplace_ledger_entries": {
                  Row: {
                    "amount_kobo": number,"created_at": string,"currency": string,"delivery_id": string | null,"entry_type": string,"id": string,"metadata": NonNullable<Json>,"order_id": string | null,"reference": string,"vendor_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_kobo": number,"created_at"?: string,"currency"?: string,"delivery_id"?: string | null,"entry_type": string,"id"?: string,"metadata"?: NonNullable<Json>,"order_id"?: string | null,"reference": string,"vendor_id"?: string | null
                  }
                  Update: {
                    "amount_kobo"?: number,"created_at"?: string,"currency"?: string,"delivery_id"?: string | null,"entry_type"?: string,"id"?: string,"metadata"?: NonNullable<Json>,"order_id"?: string | null,"reference"?: string,"vendor_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "marketplace_ledger_delivery_id_fkey"
      columns: ["delivery_id"]
isOneToOne: false
      referencedRelation: "deliveries"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "marketplace_ledger_entries_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "marketplace_ledger_entries_vendor_id_fkey"
      columns: ["vendor_id"]
isOneToOne: false
      referencedRelation: "vendors"
      referencedColumns: ["id"]
    }
                  ]
                },"notifications": {
                  Row: {
                    "created_at": string,"entity_id": string | null,"entity_type": string | null,"id": string,"kind": string,"message": string,"read_at": string | null,"title": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"entity_id"?: string | null,"entity_type"?: string | null,"id"?: string,"kind": string,"message": string,"read_at"?: string | null,"title": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"entity_id"?: string | null,"entity_type"?: string | null,"id"?: string,"kind"?: string,"message"?: string,"read_at"?: string | null,"title"?: string,"user_id"?: string
                  }
                  Relationships: [

                  ]
                },"order_events": {
                  Row: {
                    "actor_type": string,"actor_user_id": string | null,"created_at": string,"event_type": string,"from_status": string | null,"id": string,"metadata": NonNullable<Json>,"order_id": string,"public_message": string | null,"to_status": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_type": string,"actor_user_id"?: string | null,"created_at"?: string,"event_type": string,"from_status"?: string | null,"id"?: string,"metadata"?: NonNullable<Json>,"order_id": string,"public_message"?: string | null,"to_status"?: string | null
                  }
                  Update: {
                    "actor_type"?: string,"actor_user_id"?: string | null,"created_at"?: string,"event_type"?: string,"from_status"?: string | null,"id"?: string,"metadata"?: NonNullable<Json>,"order_id"?: string,"public_message"?: string | null,"to_status"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_events_actor_user_id_fkey"
      columns: ["actor_user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_events_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    }
                  ]
                },"order_items": {
                  Row: {
                    "created_at": string,"id": string,"image_snapshot": string | null,"line_subtotal_kobo": number,"listing_id": string | null,"order_id": string,"quantity": number,"stock_reserved": boolean,"title_snapshot": string,"unit_price_kobo": number,"unit_reference_price_kobo": number | null,"variant_snapshot": Json | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"image_snapshot"?: string | null,"line_subtotal_kobo": number,"listing_id"?: string | null,"order_id": string,"quantity": number,"stock_reserved"?: boolean,"title_snapshot": string,"unit_price_kobo": number,"unit_reference_price_kobo"?: number | null,"variant_snapshot"?: Json | null
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"image_snapshot"?: string | null,"line_subtotal_kobo"?: number,"listing_id"?: string | null,"order_id"?: string,"quantity"?: number,"stock_reserved"?: boolean,"title_snapshot"?: string,"unit_price_kobo"?: number,"unit_reference_price_kobo"?: number | null,"variant_snapshot"?: Json | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_items_listing_id_fkey"
      columns: ["listing_id"]
isOneToOne: false
      referencedRelation: "listings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_items_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    }
                  ]
                },"order_payments": {
                  Row: {
                    "amount_kobo": number,"authorization_url": string | null,"channel": string | null,"created_at": string,"currency": string,"failure_code": string | null,"id": string,"order_id": string,"provider": string,"provider_reference": string,"provider_transaction_id": string | null,"status": string,"updated_at": string,"verified_at": string | null,"webhook_event_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_kobo": number,"authorization_url"?: string | null,"channel"?: string | null,"created_at"?: string,"currency"?: string,"failure_code"?: string | null,"id"?: string,"order_id": string,"provider"?: string,"provider_reference": string,"provider_transaction_id"?: string | null,"status"?: string,"updated_at"?: string,"verified_at"?: string | null,"webhook_event_id"?: string | null
                  }
                  Update: {
                    "amount_kobo"?: number,"authorization_url"?: string | null,"channel"?: string | null,"created_at"?: string,"currency"?: string,"failure_code"?: string | null,"id"?: string,"order_id"?: string,"provider"?: string,"provider_reference"?: string,"provider_transaction_id"?: string | null,"status"?: string,"updated_at"?: string,"verified_at"?: string | null,"webhook_event_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_payments_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    }
                  ]
                },"orders": {
                  Row: {
                    "accepted_at": string | null,"buyer_contact_snapshot": NonNullable<Json>,"buyer_id": string,"buyer_note": string | null,"buyer_total_kobo": number,"cancelled_at": string | null,"checkout_idempotency_key": string,"completed_at": string | null,"created_at": string,"currency": string,"delivery_address_snapshot": Json | null,"delivery_fee_kobo": number,"delivery_method": string,"id": string,"inventory_released_at": string | null,"items_subtotal_kobo": number,"marketplace_commission_kobo": number,"order_status": string,"payment_processor_fee_kobo": number,"payment_status": string,"public_order_number": string,"seller_net_kobo": number,"updated_at": string,"vendor_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string | null,"buyer_contact_snapshot": NonNullable<Json>,"buyer_id": string,"buyer_note"?: string | null,"buyer_total_kobo": number,"cancelled_at"?: string | null,"checkout_idempotency_key": string,"completed_at"?: string | null,"created_at"?: string,"currency"?: string,"delivery_address_snapshot"?: Json | null,"delivery_fee_kobo"?: number,"delivery_method": string,"id"?: string,"inventory_released_at"?: string | null,"items_subtotal_kobo": number,"marketplace_commission_kobo"?: number,"order_status"?: string,"payment_processor_fee_kobo"?: number,"payment_status"?: string,"public_order_number": string,"seller_net_kobo": number,"updated_at"?: string,"vendor_id": string
                  }
                  Update: {
                    "accepted_at"?: string | null,"buyer_contact_snapshot"?: NonNullable<Json>,"buyer_id"?: string,"buyer_note"?: string | null,"buyer_total_kobo"?: number,"cancelled_at"?: string | null,"checkout_idempotency_key"?: string,"completed_at"?: string | null,"created_at"?: string,"currency"?: string,"delivery_address_snapshot"?: Json | null,"delivery_fee_kobo"?: number,"delivery_method"?: string,"id"?: string,"inventory_released_at"?: string | null,"items_subtotal_kobo"?: number,"marketplace_commission_kobo"?: number,"order_status"?: string,"payment_processor_fee_kobo"?: number,"payment_status"?: string,"public_order_number"?: string,"seller_net_kobo"?: number,"updated_at"?: string,"vendor_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "orders_buyer_id_fkey"
      columns: ["buyer_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orders_vendor_id_fkey"
      columns: ["vendor_id"]
isOneToOne: false
      referencedRelation: "vendors"
      referencedColumns: ["id"]
    }
                  ]
                },"payments": {
                  Row: {
                    "amount_ngn": number,"created_at": string,"currency": string,"id": string,"listing_subscription_id": string | null,"provider": string,"provider_transaction_id": string | null,"shop_subscription_id": string | null,"status": string,"tx_ref": string | null,"vendor_id": string,"verified_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_ngn": number,"created_at"?: string,"currency"?: string,"id"?: string,"listing_subscription_id"?: string | null,"provider"?: string,"provider_transaction_id"?: string | null,"shop_subscription_id"?: string | null,"status"?: string,"tx_ref"?: string | null,"vendor_id": string,"verified_at"?: string | null
                  }
                  Update: {
                    "amount_ngn"?: number,"created_at"?: string,"currency"?: string,"id"?: string,"listing_subscription_id"?: string | null,"provider"?: string,"provider_transaction_id"?: string | null,"shop_subscription_id"?: string | null,"status"?: string,"tx_ref"?: string | null,"vendor_id"?: string,"verified_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "payments_listing_subscription_id_fkey"
      columns: ["listing_subscription_id"]
isOneToOne: false
      referencedRelation: "listing_subscriptions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_shop_subscription_id_fkey"
      columns: ["shop_subscription_id"]
isOneToOne: false
      referencedRelation: "shop_subscriptions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_vendor_id_fkey"
      columns: ["vendor_id"]
isOneToOne: false
      referencedRelation: "vendors"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "avatar_url": string | null,"created_at": string,"display_name": string,"id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "avatar_url"?: string | null,"created_at"?: string,"display_name": string,"id": string,"updated_at"?: string
                  }
                  Update: {
                    "avatar_url"?: string | null,"created_at"?: string,"display_name"?: string,"id"?: string,"updated_at"?: string
                  }
                  Relationships: [

                  ]
                },"push_cron_secrets": {
                  Row: {
                    "id": boolean,"token": string
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: boolean,"token": string
                  }
                  Update: {
                    "id"?: boolean,"token"?: string
                  }
                  Relationships: [

                  ]
                },"push_daily_schedule": {
                  Row: {
                    "created_at": string,"last_daily_sent_on": string | null,"next_daily_at": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"last_daily_sent_on"?: string | null,"next_daily_at": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"last_daily_sent_on"?: string | null,"next_daily_at"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [

                  ]
                },"push_subscriptions": {
                  Row: {
                    "auth": string,"created_at": string,"endpoint": string,"id": string,"p256dh": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "auth": string,"created_at"?: string,"endpoint": string,"id"?: string,"p256dh": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "auth"?: string,"created_at"?: string,"endpoint"?: string,"id"?: string,"p256dh"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [

                  ]
                },"reports": {
                  Row: {
                    "created_at": string,"details": string,"id": string,"listing_id": string | null,"reason": string,"reporter_id": string,"status": string,"vendor_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"details"?: string,"id"?: string,"listing_id"?: string | null,"reason": string,"reporter_id": string,"status"?: string,"vendor_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"details"?: string,"id"?: string,"listing_id"?: string | null,"reason"?: string,"reporter_id"?: string,"status"?: string,"vendor_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "reports_listing_id_fkey"
      columns: ["listing_id"]
isOneToOne: false
      referencedRelation: "listings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reports_vendor_id_fkey"
      columns: ["vendor_id"]
isOneToOne: false
      referencedRelation: "vendors"
      referencedColumns: ["id"]
    }
                  ]
                },"seller_ledger_entries": {
                  Row: {
                    "amount_kobo": number,"created_at": string,"currency": string,"entry_type": string,"id": string,"metadata": NonNullable<Json>,"order_id": string | null,"reference": string,"vendor_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_kobo": number,"created_at"?: string,"currency"?: string,"entry_type": string,"id"?: string,"metadata"?: NonNullable<Json>,"order_id"?: string | null,"reference": string,"vendor_id": string
                  }
                  Update: {
                    "amount_kobo"?: number,"created_at"?: string,"currency"?: string,"entry_type"?: string,"id"?: string,"metadata"?: NonNullable<Json>,"order_id"?: string | null,"reference"?: string,"vendor_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "seller_ledger_entries_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "seller_ledger_entries_vendor_id_fkey"
      columns: ["vendor_id"]
isOneToOne: false
      referencedRelation: "vendors"
      referencedColumns: ["id"]
    }
                  ]
                },"seller_payouts": {
                  Row: {
                    "amount_kobo": number,"currency": string,"failure_reason": string | null,"id": string,"processed_at": string | null,"provider": string,"provider_reference": string | null,"requested_at": string,"status": string,"vendor_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_kobo": number,"currency"?: string,"failure_reason"?: string | null,"id"?: string,"processed_at"?: string | null,"provider"?: string,"provider_reference"?: string | null,"requested_at"?: string,"status"?: string,"vendor_id": string
                  }
                  Update: {
                    "amount_kobo"?: number,"currency"?: string,"failure_reason"?: string | null,"id"?: string,"processed_at"?: string | null,"provider"?: string,"provider_reference"?: string | null,"requested_at"?: string,"status"?: string,"vendor_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "seller_payouts_vendor_id_fkey"
      columns: ["vendor_id"]
isOneToOne: false
      referencedRelation: "vendors"
      referencedColumns: ["id"]
    }
                  ]
                },"seller_reports": {
                  Row: {
                    "created_at": string,"details": string,"evidence_paths": (string)[],"id": string,"listing_id": string | null,"reason": string,"reporter_id": string,"status": string,"updated_at": string,"vendor_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"details": string,"evidence_paths"?: (string)[],"id"?: string,"listing_id"?: string | null,"reason": string,"reporter_id": string,"status"?: string,"updated_at"?: string,"vendor_id": string
                  }
                  Update: {
                    "created_at"?: string,"details"?: string,"evidence_paths"?: (string)[],"id"?: string,"listing_id"?: string | null,"reason"?: string,"reporter_id"?: string,"status"?: string,"updated_at"?: string,"vendor_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "seller_reports_listing_id_fkey"
      columns: ["listing_id"]
isOneToOne: false
      referencedRelation: "listings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "seller_reports_vendor_id_fkey"
      columns: ["vendor_id"]
isOneToOne: false
      referencedRelation: "vendors"
      referencedColumns: ["id"]
    }
                  ]
                },"seller_reviews": {
                  Row: {
                    "created_at": string,"id": string,"rating": number,"review_text": string,"reviewer_id": string,"transaction_id": string,"vendor_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"rating": number,"review_text"?: string,"reviewer_id": string,"transaction_id": string,"vendor_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"rating"?: number,"review_text"?: string,"reviewer_id"?: string,"transaction_id"?: string,"vendor_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "seller_reviews_transaction_id_fkey"
      columns: ["transaction_id"]
isOneToOne: true
      referencedRelation: "transactions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "seller_reviews_vendor_id_fkey"
      columns: ["vendor_id"]
isOneToOne: false
      referencedRelation: "vendors"
      referencedColumns: ["id"]
    }
                  ]
                },"shop_subscriptions": {
                  Row: {
                    "amount_ngn": number,"created_at": string,"expires_at": string | null,"id": string,"starts_at": string | null,"status": string,"vendor_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_ngn"?: number,"created_at"?: string,"expires_at"?: string | null,"id"?: string,"starts_at"?: string | null,"status"?: string,"vendor_id": string
                  }
                  Update: {
                    "amount_ngn"?: number,"created_at"?: string,"expires_at"?: string | null,"id"?: string,"starts_at"?: string | null,"status"?: string,"vendor_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "shop_subscriptions_vendor_id_fkey"
      columns: ["vendor_id"]
isOneToOne: false
      referencedRelation: "vendors"
      referencedColumns: ["id"]
    }
                  ]
                },"transactions": {
                  Row: {
                    "buyer_confirmed": boolean,"buyer_id": string,"completed_at": string | null,"created_at": string,"id": string,"listing_id": string,"seller_confirmed": boolean,"seller_id": string,"status": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "buyer_confirmed"?: boolean,"buyer_id": string,"completed_at"?: string | null,"created_at"?: string,"id"?: string,"listing_id": string,"seller_confirmed"?: boolean,"seller_id": string,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "buyer_confirmed"?: boolean,"buyer_id"?: string,"completed_at"?: string | null,"created_at"?: string,"id"?: string,"listing_id"?: string,"seller_confirmed"?: boolean,"seller_id"?: string,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "transactions_listing_id_fkey"
      columns: ["listing_id"]
isOneToOne: false
      referencedRelation: "listings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transactions_seller_id_fkey"
      columns: ["seller_id"]
isOneToOne: false
      referencedRelation: "vendors"
      referencedColumns: ["id"]
    }
                  ]
                },"vendors": {
                  Row: {
                    "bio": string,"created_at": string,"id": string,"logo_url": string | null,"profile_id": string,"shop_name": string,"updated_at": string,"verification_status": string,"whatsapp_number": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "bio"?: string,"created_at"?: string,"id"?: string,"logo_url"?: string | null,"profile_id": string,"shop_name": string,"updated_at"?: string,"verification_status"?: string,"whatsapp_number"?: string | null
                  }
                  Update: {
                    "bio"?: string,"created_at"?: string,"id"?: string,"logo_url"?: string | null,"profile_id"?: string,"shop_name"?: string,"updated_at"?: string,"verification_status"?: string,"whatsapp_number"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "vendors_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "activate_listing_subscription_internal":
{ Args: { "p_provider_transaction_id": string,"p_tx_ref": string }; Returns: boolean
                           },
"activate_shop_subscription_internal":
{ Args: { "p_provider_transaction_id": string,"p_tx_ref": string }; Returns: boolean
                           },
"admin_assign_delivery_agent":
{ Args: { "p_agent_id": string,"p_delivery_id": string }; Returns: Json
                           },
"admin_review_delivery_agent":
{ Args: { "p_agent_id": string,"p_status": string }; Returns: Json
                           },
"agent_accept_delivery":
{ Args: { "p_delivery_id": string }; Returns: Json
                           },
"agent_list_my_deliveries":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"agent_mark_delivery_picked_up":
{ Args: { "p_delivery_id": string }; Returns: Json
                           },
"agent_verify_delivery_code":
{ Args: { "p_code": string,"p_delivery_id": string }; Returns: Json
                           },
"apply_as_delivery_agent":
{ Args: { "p_display_name": string,"p_phone": string }; Returns: Json
                           },
"buyer_confirm_order_received":
{ Args: { "p_order_id": string }; Returns: Json
                           },
"buyer_generate_delivery_code":
{ Args: { "p_delivery_id": string }; Returns: Json
                           },
"claim_due_daily_push_users":
{ Args: Record<PropertyKey, never>; Returns: {
              "user_id": string
            }[]
                           },
"confirm_order_payment":
{ Args: { "p_channel"?: string,"p_provider_reference": string,"p_provider_transaction_id": string,"p_webhook_event_id"?: string }; Returns: boolean
                           },
"create_order_checkout":
{ Args: { "p_buyer_contact": Json,"p_buyer_id": string,"p_buyer_note": string,"p_cart_id": string,"p_delivery_address": Json,"p_delivery_method": string,"p_idempotency_key": string,"p_provider_reference": string }; Returns: Json
                           },
"fail_order_payment":
{ Args: { "p_failure_code"?: string,"p_provider_reference": string }; Returns: boolean
                           },
"get_my_shop_analytics":
{ Args: { "p_days"?: number }; Returns: Json
                           },
"get_public_shop_completed_sales":
{ Args: { "p_vendor_id": string }; Returns: number
                           },
"record_listing_event":
{ Args: { "p_event_type": string,"p_listing_id": string,"p_visitor_key": string }; Returns: undefined
                           },
"search_marketplace_listings":
{ Args: { "p_category"?: string,"p_limit"?: number,"p_max_price"?: number,"p_min_price"?: number,"p_offset"?: number,"p_search"?: string,"p_sort"?: string }; Returns: {
              "category": string,"created_at": string,"description": string,"id": string,"image_urls": (string)[],"price_ngn": number,"relevance": number,"stock_quantity": number,"title": string,"total_count": number,"vendor": Json
            }[]
                           },
"seller_update_order_status":
{ Args: { "p_next_status": string,"p_order_id": string,"p_public_message"?: string }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {

          }
        },"public": {
          Enums: {

          }
        }
} as const
