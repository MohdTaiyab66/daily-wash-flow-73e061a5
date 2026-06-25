export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      area_change_history: {
        Row: {
          changed_at: string
          from_area: string | null
          id: string
          partner_id: string
          to_area: string
        }
        Insert: {
          changed_at?: string
          from_area?: string | null
          id?: string
          partner_id: string
          to_area: string
        }
        Update: {
          changed_at?: string
          from_area?: string | null
          id?: string
          partner_id?: string
          to_area?: string
        }
        Relationships: [
          {
            foreignKeyName: "area_change_history_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      area_waitlist: {
        Row: {
          area: string
          created_at: string
          full_name: string | null
          id: string
          notified: boolean
          phone: string
        }
        Insert: {
          area: string
          created_at?: string
          full_name?: string | null
          id?: string
          notified?: boolean
          phone: string
        }
        Update: {
          area?: string
          created_at?: string
          full_name?: string | null
          id?: string
          notified?: boolean
          phone?: string
        }
        Relationships: []
      }
      assignment_changes: {
        Row: {
          assignment_id: string
          change_type: string
          created_at: string
          delta_cars: number
          id: string
          new_target: number
          partner_id: string
          previous_target: number
          released_customer_ids: string[] | null
        }
        Insert: {
          assignment_id: string
          change_type: string
          created_at?: string
          delta_cars: number
          id?: string
          new_target: number
          partner_id: string
          previous_target: number
          released_customer_ids?: string[] | null
        }
        Update: {
          assignment_id?: string
          change_type?: string
          created_at?: string
          delta_cars?: number
          id?: string
          new_target?: number
          partner_id?: string
          previous_target?: number
          released_customer_ids?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "assignment_changes_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_changes_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      assignments: {
        Row: {
          accepted_at: string
          area: string
          completed_at: string | null
          created_at: string
          duration_days: number
          end_date: string
          estimated_distance_km: number
          estimated_earnings: number
          estimated_hours: number
          expected_start_time: string
          fulfilled_cars: number
          id: string
          last_modified_at: string | null
          modification_count: number
          partner_id: string
          rate_per_car: number
          scheduled_date: string
          search_radius_km: number
          start_date: string
          status: string
          target_cars: number
          total_earnings: number
          working_days: number
        }
        Insert: {
          accepted_at?: string
          area: string
          completed_at?: string | null
          created_at?: string
          duration_days?: number
          end_date?: string
          estimated_distance_km: number
          estimated_earnings: number
          estimated_hours: number
          expected_start_time?: string
          fulfilled_cars?: number
          id?: string
          last_modified_at?: string | null
          modification_count?: number
          partner_id: string
          rate_per_car?: number
          scheduled_date?: string
          search_radius_km?: number
          start_date?: string
          status?: string
          target_cars: number
          total_earnings?: number
          working_days?: number
        }
        Update: {
          accepted_at?: string
          area?: string
          completed_at?: string | null
          created_at?: string
          duration_days?: number
          end_date?: string
          estimated_distance_km?: number
          estimated_earnings?: number
          estimated_hours?: number
          expected_start_time?: string
          fulfilled_cars?: number
          id?: string
          last_modified_at?: string | null
          modification_count?: number
          partner_id?: string
          rate_per_car?: number
          scheduled_date?: string
          search_radius_km?: number
          start_date?: string
          status?: string
          target_cars?: number
          total_earnings?: number
          working_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "assignments_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance: {
        Row: {
          attendance_date: string
          id: string
          marked_at: string
          partner_id: string
          status: Database["public"]["Enums"]["availability_status"]
        }
        Insert: {
          attendance_date?: string
          id?: string
          marked_at?: string
          partner_id: string
          status?: Database["public"]["Enums"]["availability_status"]
        }
        Update: {
          attendance_date?: string
          id?: string
          marked_at?: string
          partner_id?: string
          status?: Database["public"]["Enums"]["availability_status"]
        }
        Relationships: [
          {
            foreignKeyName: "attendance_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_addons: {
        Row: {
          addon_key: string
          addon_name: string
          booking_id: string
          created_at: string
          id: string
          price: number
          quantity: number
        }
        Insert: {
          addon_key: string
          addon_name: string
          booking_id: string
          created_at?: string
          id?: string
          price: number
          quantity?: number
        }
        Update: {
          addon_key?: string
          addon_name?: string
          booking_id?: string
          created_at?: string
          id?: string
          price?: number
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "booking_addons_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          addon_amount: number
          address_id: string | null
          base_amount: number
          claimed_at: string | null
          created_at: string
          discount_amount: number
          id: string
          notes: string | null
          ops_service_id: string | null
          partner_id: string | null
          payment_status: string
          preferred_before_time: string | null
          razorpay_order_id: string | null
          razorpay_payment_id: string | null
          scheduled_date: string | null
          scheduled_time: string | null
          service_id: string
          status: string
          total_amount: number
          updated_at: string
          user_id: string
          vehicle_id: string | null
        }
        Insert: {
          addon_amount?: number
          address_id?: string | null
          base_amount?: number
          claimed_at?: string | null
          created_at?: string
          discount_amount?: number
          id?: string
          notes?: string | null
          ops_service_id?: string | null
          partner_id?: string | null
          payment_status?: string
          preferred_before_time?: string | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          scheduled_date?: string | null
          scheduled_time?: string | null
          service_id: string
          status?: string
          total_amount?: number
          updated_at?: string
          user_id: string
          vehicle_id?: string | null
        }
        Update: {
          addon_amount?: number
          address_id?: string | null
          base_amount?: number
          claimed_at?: string | null
          created_at?: string
          discount_amount?: number
          id?: string
          notes?: string | null
          ops_service_id?: string | null
          partner_id?: string | null
          payment_status?: string
          preferred_before_time?: string | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          scheduled_date?: string | null
          scheduled_time?: string | null
          service_id?: string
          status?: string
          total_amount?: number
          updated_at?: string
          user_id?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_address_id_fkey"
            columns: ["address_id"]
            isOneToOne: false
            referencedRelation: "customer_addresses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_ops_service_id_fkey"
            columns: ["ops_service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "service_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "customer_vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      complaints: {
        Row: {
          complaint_type: string
          created_at: string
          customer_id: string
          description: string | null
          id: string
          partner_id: string | null
          resolution_notes: string | null
          service_id: string | null
          status: Database["public"]["Enums"]["complaint_status"]
          updated_at: string
        }
        Insert: {
          complaint_type: string
          created_at?: string
          customer_id: string
          description?: string | null
          id?: string
          partner_id?: string | null
          resolution_notes?: string | null
          service_id?: string | null
          status?: Database["public"]["Enums"]["complaint_status"]
          updated_at?: string
        }
        Update: {
          complaint_type?: string
          created_at?: string
          customer_id?: string
          description?: string | null
          id?: string
          partner_id?: string | null
          resolution_notes?: string | null
          service_id?: string | null
          status?: Database["public"]["Enums"]["complaint_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "complaints_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaints_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaints_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_addresses: {
        Row: {
          address_line: string
          area: string
          created_at: string
          id: string
          is_default: boolean
          label: string
          latitude: number | null
          longitude: number | null
          parking_notes: string | null
          pincode: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          address_line: string
          area: string
          created_at?: string
          id?: string
          is_default?: boolean
          label?: string
          latitude?: number | null
          longitude?: number | null
          parking_notes?: string | null
          pincode?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          address_line?: string
          area?: string
          created_at?: string
          id?: string
          is_default?: boolean
          label?: string
          latitude?: number | null
          longitude?: number | null
          parking_notes?: string | null
          pincode?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      customer_notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          link: string | null
          metadata: Json
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          metadata?: Json
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          metadata?: Json
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      customer_profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          marketing_opt_in: boolean
          phone: string | null
          preferred_area: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          marketing_opt_in?: boolean
          phone?: string | null
          preferred_area?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          marketing_opt_in?: boolean
          phone?: string | null
          preferred_area?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      customer_referrals: {
        Row: {
          approved_at: string | null
          area: string | null
          created_at: string
          customer_name: string
          customer_phone: string
          id: string
          incentive_amount: number
          incentive_paid: boolean
          partner_id: string
          status: string
        }
        Insert: {
          approved_at?: string | null
          area?: string | null
          created_at?: string
          customer_name: string
          customer_phone: string
          id?: string
          incentive_amount?: number
          incentive_paid?: boolean
          partner_id: string
          status?: string
        }
        Update: {
          approved_at?: string | null
          area?: string | null
          created_at?: string
          customer_name?: string
          customer_phone?: string
          id?: string
          incentive_amount?: number
          incentive_paid?: boolean
          partner_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_referrals_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_vehicles: {
        Row: {
          category: string
          color: string | null
          created_at: string
          id: string
          image_path: string | null
          is_default: boolean
          make: string
          model: string
          parking_notes: string | null
          registration_number: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category: string
          color?: string | null
          created_at?: string
          id?: string
          image_path?: string | null
          is_default?: boolean
          make: string
          model: string
          parking_notes?: string | null
          registration_number: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          color?: string | null
          created_at?: string
          id?: string
          image_path?: string | null
          is_default?: boolean
          make?: string
          model?: string
          parking_notes?: string | null
          registration_number?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          address_line: string
          area: string | null
          city: string
          created_at: string
          email: string | null
          exterior_wash_done_date: string | null
          exterior_wash_partner_id: string | null
          full_name: string
          id: string
          interior_wash_done_date: string | null
          interior_wash_partner_id: string | null
          is_active: boolean
          latitude: number | null
          longitude: number | null
          paid_at: string | null
          payment_status: string
          phone: string
          pincode: string | null
          preferred_time: string
          service_required_before: string | null
          subscription_end: string
          subscription_plan: Database["public"]["Enums"]["subscription_plan"]
          subscription_start: string
          updated_at: string
        }
        Insert: {
          address_line: string
          area?: string | null
          city?: string
          created_at?: string
          email?: string | null
          exterior_wash_done_date?: string | null
          exterior_wash_partner_id?: string | null
          full_name: string
          id?: string
          interior_wash_done_date?: string | null
          interior_wash_partner_id?: string | null
          is_active?: boolean
          latitude?: number | null
          longitude?: number | null
          paid_at?: string | null
          payment_status?: string
          phone: string
          pincode?: string | null
          preferred_time?: string
          service_required_before?: string | null
          subscription_end?: string
          subscription_plan?: Database["public"]["Enums"]["subscription_plan"]
          subscription_start?: string
          updated_at?: string
        }
        Update: {
          address_line?: string
          area?: string | null
          city?: string
          created_at?: string
          email?: string | null
          exterior_wash_done_date?: string | null
          exterior_wash_partner_id?: string | null
          full_name?: string
          id?: string
          interior_wash_done_date?: string | null
          interior_wash_partner_id?: string | null
          is_active?: boolean
          latitude?: number | null
          longitude?: number | null
          paid_at?: string | null
          payment_status?: string
          phone?: string
          pincode?: string | null
          preferred_time?: string
          service_required_before?: string | null
          subscription_end?: string
          subscription_plan?: Database["public"]["Enums"]["subscription_plan"]
          subscription_start?: string
          updated_at?: string
        }
        Relationships: []
      }
      dirty_vehicle_reports: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          partner_id: string
          photo_front: string | null
          photo_left: string | null
          photo_rear: string | null
          photo_right: string | null
          reason: string
          service_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          partner_id: string
          photo_front?: string | null
          photo_left?: string | null
          photo_rear?: string | null
          photo_right?: string | null
          reason: string
          service_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          partner_id?: string
          photo_front?: string | null
          photo_left?: string | null
          photo_rear?: string | null
          photo_right?: string | null
          reason?: string
          service_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dirty_vehicle_reports_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dirty_vehicle_reports_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      earnings: {
        Row: {
          base_amount: number
          cars_completed: number
          created_at: string
          earned_on: string
          id: string
          incentive_amount: number
          partner_id: string
          penalty_amount: number
          referral_amount: number
          total_amount: number | null
        }
        Insert: {
          base_amount?: number
          cars_completed?: number
          created_at?: string
          earned_on?: string
          id?: string
          incentive_amount?: number
          partner_id: string
          penalty_amount?: number
          referral_amount?: number
          total_amount?: number | null
        }
        Update: {
          base_amount?: number
          cars_completed?: number
          created_at?: string
          earned_on?: string
          id?: string
          incentive_amount?: number
          partner_id?: string
          penalty_amount?: number
          referral_amount?: number
          total_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "earnings_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      multi_vehicle_discounts: {
        Row: {
          active: boolean
          created_at: string
          id: string
          percent: number
          updated_at: string
          vehicle_count: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          percent: number
          updated_at?: string
          vehicle_count: number
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          percent?: number
          updated_at?: string
          vehicle_count?: number
        }
        Relationships: []
      }
      parking_reports: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          partner_id: string
          photo_path: string | null
          reason: string
          service_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          partner_id: string
          photo_path?: string | null
          reason: string
          service_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          partner_id?: string
          photo_path?: string | null
          reason?: string
          service_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "parking_reports_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parking_reports_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          link: string | null
          metadata: Json
          partner_id: string
          read_at: string | null
          title: string
          type: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          metadata?: Json
          partner_id: string
          read_at?: string | null
          title: string
          type: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          metadata?: Json
          partner_id?: string
          read_at?: string | null
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_notifications_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_referrals: {
        Row: {
          created_at: string
          days_completed: number
          id: string
          referee_id: string | null
          referee_phone: string | null
          referrer_id: string
          reward_amount: number
          reward_paid: boolean
          status: string
        }
        Insert: {
          created_at?: string
          days_completed?: number
          id?: string
          referee_id?: string | null
          referee_phone?: string | null
          referrer_id: string
          reward_amount?: number
          reward_paid?: boolean
          status?: string
        }
        Update: {
          created_at?: string
          days_completed?: number
          id?: string
          referee_id?: string | null
          referee_phone?: string | null
          referrer_id?: string
          reward_amount?: number
          reward_paid?: boolean
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_referrals_referee_id_fkey"
            columns: ["referee_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_referrals_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_reliability_events: {
        Row: {
          assignment_id: string | null
          created_at: string
          delta: number
          event_type: Database["public"]["Enums"]["reliability_event_type"]
          id: string
          note: string | null
          partner_id: string
          service_id: string | null
        }
        Insert: {
          assignment_id?: string | null
          created_at?: string
          delta: number
          event_type: Database["public"]["Enums"]["reliability_event_type"]
          id?: string
          note?: string | null
          partner_id: string
          service_id?: string | null
        }
        Update: {
          assignment_id?: string | null
          created_at?: string
          delta?: number
          event_type?: Database["public"]["Enums"]["reliability_event_type"]
          id?: string
          note?: string | null
          partner_id?: string
          service_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_reliability_events_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      partners: {
        Row: {
          aadhaar_number: string | null
          aadhaar_verified: boolean
          accepting_new: boolean
          area_change_count: number
          area_locked_until: string | null
          attendance_pct: number
          availability: Database["public"]["Enums"]["availability_status"]
          bank_account_holder: string | null
          bank_account_number: string | null
          bank_ifsc: string | null
          bank_verified: boolean
          cars_selected: number
          city: string
          created_at: string
          email: string | null
          first_assignment_completed: boolean
          full_name: string | null
          home_area: string | null
          home_lat: number | null
          home_lng: number | null
          id: string
          joined_on: string
          last_seen: string | null
          level: string
          lifetime_earnings: number
          max_daily_cars: number
          notify_when_customers_added: boolean
          pan_number: string | null
          pan_verified: boolean
          partner_code: string
          phone: string
          preferred_language: string
          previous_area: string | null
          profile_photo_url: string | null
          rate_per_car: number
          rating: number
          referral_code: string
          referred_by: string | null
          reliability_events_count: number
          reliability_score: number
          status: Database["public"]["Enums"]["partner_status"]
          total_cars_completed: number
          training_completion_pct: number
          updated_at: string
        }
        Insert: {
          aadhaar_number?: string | null
          aadhaar_verified?: boolean
          accepting_new?: boolean
          area_change_count?: number
          area_locked_until?: string | null
          attendance_pct?: number
          availability?: Database["public"]["Enums"]["availability_status"]
          bank_account_holder?: string | null
          bank_account_number?: string | null
          bank_ifsc?: string | null
          bank_verified?: boolean
          cars_selected?: number
          city?: string
          created_at?: string
          email?: string | null
          first_assignment_completed?: boolean
          full_name?: string | null
          home_area?: string | null
          home_lat?: number | null
          home_lng?: number | null
          id: string
          joined_on?: string
          last_seen?: string | null
          level?: string
          lifetime_earnings?: number
          max_daily_cars?: number
          notify_when_customers_added?: boolean
          pan_number?: string | null
          pan_verified?: boolean
          partner_code?: string
          phone: string
          preferred_language?: string
          previous_area?: string | null
          profile_photo_url?: string | null
          rate_per_car?: number
          rating?: number
          referral_code?: string
          referred_by?: string | null
          reliability_events_count?: number
          reliability_score?: number
          status?: Database["public"]["Enums"]["partner_status"]
          total_cars_completed?: number
          training_completion_pct?: number
          updated_at?: string
        }
        Update: {
          aadhaar_number?: string | null
          aadhaar_verified?: boolean
          accepting_new?: boolean
          area_change_count?: number
          area_locked_until?: string | null
          attendance_pct?: number
          availability?: Database["public"]["Enums"]["availability_status"]
          bank_account_holder?: string | null
          bank_account_number?: string | null
          bank_ifsc?: string | null
          bank_verified?: boolean
          cars_selected?: number
          city?: string
          created_at?: string
          email?: string | null
          first_assignment_completed?: boolean
          full_name?: string | null
          home_area?: string | null
          home_lat?: number | null
          home_lng?: number | null
          id?: string
          joined_on?: string
          last_seen?: string | null
          level?: string
          lifetime_earnings?: number
          max_daily_cars?: number
          notify_when_customers_added?: boolean
          pan_number?: string | null
          pan_verified?: boolean
          partner_code?: string
          phone?: string
          preferred_language?: string
          previous_area?: string | null
          profile_photo_url?: string | null
          rate_per_car?: number
          rating?: number
          referral_code?: string
          referred_by?: string | null
          reliability_events_count?: number
          reliability_score?: number
          status?: Database["public"]["Enums"]["partner_status"]
          total_cars_completed?: number
          training_completion_pct?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partners_referred_by_fkey"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_transactions: {
        Row: {
          amount: number | null
          booking_id: string | null
          created_at: string
          event_type: string
          id: string
          payment_id: string | null
          provider: string
          provider_order_id: string | null
          provider_payment_id: string | null
          raw_payload: Json
          signature: string | null
          status: string
          user_id: string
        }
        Insert: {
          amount?: number | null
          booking_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          payment_id?: string | null
          provider?: string
          provider_order_id?: string | null
          provider_payment_id?: string | null
          raw_payload?: Json
          signature?: string | null
          status?: string
          user_id: string
        }
        Update: {
          amount?: number | null
          booking_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          payment_id?: string | null
          provider?: string
          provider_order_id?: string | null
          provider_payment_id?: string | null
          raw_payload?: Json
          signature?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_transactions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_transactions_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          booking_id: string | null
          created_at: string
          currency: string
          id: string
          metadata: Json
          provider: string
          provider_order_id: string | null
          provider_payment_id: string | null
          status: string
          subscription_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          booking_id?: string | null
          created_at?: string
          currency?: string
          id?: string
          metadata?: Json
          provider?: string
          provider_order_id?: string | null
          provider_payment_id?: string | null
          status?: string
          subscription_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          booking_id?: string | null
          created_at?: string
          currency?: string
          id?: string
          metadata?: Json
          provider?: string
          provider_order_id?: string | null
          provider_payment_id?: string | null
          status?: string
          subscription_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      payouts: {
        Row: {
          base_amount: number
          cars_completed: number
          created_at: string
          id: string
          incentive_amount: number
          paid_at: string | null
          partner_id: string
          penalty_amount: number
          referral_amount: number
          status: Database["public"]["Enums"]["payout_status"]
          total_amount: number
          week_end: string
          week_start: string
        }
        Insert: {
          base_amount?: number
          cars_completed?: number
          created_at?: string
          id?: string
          incentive_amount?: number
          paid_at?: string | null
          partner_id: string
          penalty_amount?: number
          referral_amount?: number
          status?: Database["public"]["Enums"]["payout_status"]
          total_amount?: number
          week_end: string
          week_start: string
        }
        Update: {
          base_amount?: number
          cars_completed?: number
          created_at?: string
          id?: string
          incentive_amount?: number
          paid_at?: string | null
          partner_id?: string
          penalty_amount?: number
          referral_amount?: number
          status?: Database["public"]["Enums"]["payout_status"]
          total_amount?: number
          week_end?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "payouts_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_settings: {
        Row: {
          description: string | null
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          description?: string | null
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          description?: string | null
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      push_tokens: {
        Row: {
          created_at: string
          id: string
          platform: string
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          platform?: string
          token: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          platform?: string
          token?: string
          user_id?: string
        }
        Relationships: []
      }
      referral_config: {
        Row: {
          active: boolean
          id: number
          referred_reward: number
          referrer_reward: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          id?: number
          referred_reward?: number
          referrer_reward?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          id?: number
          referred_reward?: number
          referrer_reward?: number
          updated_at?: string
        }
        Relationships: []
      }
      service_addons: {
        Row: {
          active: boolean
          applies_to_slugs: string[]
          created_at: string
          description: string | null
          icon_url: string | null
          id: string
          name: string
          price_hatchback: number
          price_sedan_suv: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          applies_to_slugs?: string[]
          created_at?: string
          description?: string | null
          icon_url?: string | null
          id?: string
          name: string
          price_hatchback?: number
          price_sedan_suv?: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          applies_to_slugs?: string[]
          created_at?: string
          description?: string | null
          icon_url?: string | null
          id?: string
          name?: string
          price_hatchback?: number
          price_sedan_suv?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      service_analytics: {
        Row: {
          area: string | null
          cleaning_seconds: number
          created_at: string
          id: string
          partner_id: string
          service_id: string
          total_seconds: number
          travel_seconds: number
        }
        Insert: {
          area?: string | null
          cleaning_seconds?: number
          created_at?: string
          id?: string
          partner_id: string
          service_id: string
          total_seconds?: number
          travel_seconds?: number
        }
        Update: {
          area?: string | null
          cleaning_seconds?: number
          created_at?: string
          id?: string
          partner_id?: string
          service_id?: string
          total_seconds?: number
          travel_seconds?: number
        }
        Relationships: [
          {
            foreignKeyName: "service_analytics_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_analytics_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: true
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      service_catalog: {
        Row: {
          active: boolean
          addons: Json
          banner_url: string | null
          benefits: string[] | null
          created_at: string
          description: string | null
          duration_minutes: number | null
          id: string
          includes_hatchback: string[]
          includes_sedan_suv: string[]
          name: string
          price_hatchback: number
          price_sedan_suv: number
          service_type: string
          slug: string
          sort_order: number
          updated_at: string
          video_url: string | null
        }
        Insert: {
          active?: boolean
          addons?: Json
          banner_url?: string | null
          benefits?: string[] | null
          created_at?: string
          description?: string | null
          duration_minutes?: number | null
          id?: string
          includes_hatchback?: string[]
          includes_sedan_suv?: string[]
          name: string
          price_hatchback?: number
          price_sedan_suv?: number
          service_type: string
          slug: string
          sort_order?: number
          updated_at?: string
          video_url?: string | null
        }
        Update: {
          active?: boolean
          addons?: Json
          banner_url?: string | null
          benefits?: string[] | null
          created_at?: string
          description?: string | null
          duration_minutes?: number | null
          id?: string
          includes_hatchback?: string[]
          includes_sedan_suv?: string[]
          name?: string
          price_hatchback?: number
          price_sedan_suv?: number
          service_type?: string
          slug?: string
          sort_order?: number
          updated_at?: string
          video_url?: string | null
        }
        Relationships: []
      }
      service_photos: {
        Row: {
          angle: Database["public"]["Enums"]["photo_angle"]
          captured_at: string
          id: string
          lat: number | null
          lng: number | null
          metadata: Json | null
          partner_id: string
          service_id: string
          stage: Database["public"]["Enums"]["photo_stage"]
          storage_path: string
        }
        Insert: {
          angle: Database["public"]["Enums"]["photo_angle"]
          captured_at?: string
          id?: string
          lat?: number | null
          lng?: number | null
          metadata?: Json | null
          partner_id: string
          service_id: string
          stage: Database["public"]["Enums"]["photo_stage"]
          storage_path: string
        }
        Update: {
          angle?: Database["public"]["Enums"]["photo_angle"]
          captured_at?: string
          id?: string
          lat?: number | null
          lng?: number | null
          metadata?: Json | null
          partner_id?: string
          service_id?: string
          stage?: Database["public"]["Enums"]["photo_stage"]
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_photos_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_photos_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          assignment_id: string | null
          complete_lat: number | null
          complete_lng: number | null
          completed_at: string | null
          created_at: string
          customer_id: string
          fraud_review: boolean
          gps_distance_m: number | null
          gps_flag: string | null
          id: string
          partner_id: string | null
          rate_per_car: number
          scheduled_date: string
          sequence_no: number | null
          start_lat: number | null
          start_lng: number | null
          started_at: string | null
          status: Database["public"]["Enums"]["service_status"]
          time_slot: string
          unavailable_lat: number | null
          unavailable_lng: number | null
          unavailable_notes: string | null
          unavailable_photo: string | null
          unavailable_reason:
            | Database["public"]["Enums"]["unavailable_reason"]
            | null
          updated_at: string
          vehicle_id: string
        }
        Insert: {
          assignment_id?: string | null
          complete_lat?: number | null
          complete_lng?: number | null
          completed_at?: string | null
          created_at?: string
          customer_id: string
          fraud_review?: boolean
          gps_distance_m?: number | null
          gps_flag?: string | null
          id?: string
          partner_id?: string | null
          rate_per_car?: number
          scheduled_date?: string
          sequence_no?: number | null
          start_lat?: number | null
          start_lng?: number | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["service_status"]
          time_slot?: string
          unavailable_lat?: number | null
          unavailable_lng?: number | null
          unavailable_notes?: string | null
          unavailable_photo?: string | null
          unavailable_reason?:
            | Database["public"]["Enums"]["unavailable_reason"]
            | null
          updated_at?: string
          vehicle_id: string
        }
        Update: {
          assignment_id?: string | null
          complete_lat?: number | null
          complete_lng?: number | null
          completed_at?: string | null
          created_at?: string
          customer_id?: string
          fraud_review?: boolean
          gps_distance_m?: number | null
          gps_flag?: string | null
          id?: string
          partner_id?: string | null
          rate_per_car?: number
          scheduled_date?: string
          sequence_no?: number | null
          start_lat?: number | null
          start_lng?: number | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["service_status"]
          time_slot?: string
          unavailable_lat?: number | null
          unavailable_lng?: number | null
          unavailable_notes?: string | null
          unavailable_photo?: string | null
          unavailable_reason?:
            | Database["public"]["Enums"]["unavailable_reason"]
            | null
          updated_at?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "services_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_assignment_queue: {
        Row: {
          area: string | null
          assigned_partner_id: string | null
          attempts_log: Json
          booking_id: string
          created_at: string
          current_offer_partner_id: string | null
          customer_id: string
          id: string
          lat: number | null
          lng: number | null
          lock_until: string | null
          locked_partner_id: string | null
          offer_expires_at: string | null
          radius_km: number
          service_required_before: string | null
          status: string
          tried_partner_ids: string[]
          updated_at: string
          vehicle_category: string | null
        }
        Insert: {
          area?: string | null
          assigned_partner_id?: string | null
          attempts_log?: Json
          booking_id: string
          created_at?: string
          current_offer_partner_id?: string | null
          customer_id: string
          id?: string
          lat?: number | null
          lng?: number | null
          lock_until?: string | null
          locked_partner_id?: string | null
          offer_expires_at?: string | null
          radius_km?: number
          service_required_before?: string | null
          status?: string
          tried_partner_ids?: string[]
          updated_at?: string
          vehicle_category?: string | null
        }
        Update: {
          area?: string | null
          assigned_partner_id?: string | null
          attempts_log?: Json
          booking_id?: string
          created_at?: string
          current_offer_partner_id?: string | null
          customer_id?: string
          id?: string
          lat?: number | null
          lng?: number | null
          lock_until?: string | null
          locked_partner_id?: string | null
          offer_expires_at?: string | null
          radius_km?: number
          service_required_before?: string | null
          status?: string
          tried_partner_ids?: string[]
          updated_at?: string
          vehicle_category?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscription_assignment_queue_assigned_partner_id_fkey"
            columns: ["assigned_partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_assignment_queue_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_assignment_queue_current_offer_partner_id_fkey"
            columns: ["current_offer_partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_extensions: {
        Row: {
          created_at: string
          created_by: string | null
          customer_id: string
          days: number
          id: string
          new_end: string
          previous_end: string
          reason: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_id: string
          days: number
          id?: string
          new_end: string
          previous_end: string
          reason: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_id?: string
          days?: number
          id?: string
          new_end?: string
          previous_end?: string
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_extensions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_offers: {
        Row: {
          created_at: string
          distance_from_route_m: number | null
          distance_m: number | null
          expires_at: string | null
          extra_per_day_paise: number | null
          extra_per_month_paise: number | null
          id: string
          offered_at: string
          partner_id: string
          projected_extra_earnings: number | null
          queue_id: string
          responded_at: string | null
          response: string
          route_delta_seconds: number | null
          scope: string
          score: number | null
          score_breakdown: Json | null
        }
        Insert: {
          created_at?: string
          distance_from_route_m?: number | null
          distance_m?: number | null
          expires_at?: string | null
          extra_per_day_paise?: number | null
          extra_per_month_paise?: number | null
          id?: string
          offered_at?: string
          partner_id: string
          projected_extra_earnings?: number | null
          queue_id: string
          responded_at?: string | null
          response?: string
          route_delta_seconds?: number | null
          scope?: string
          score?: number | null
          score_breakdown?: Json | null
        }
        Update: {
          created_at?: string
          distance_from_route_m?: number | null
          distance_m?: number | null
          expires_at?: string | null
          extra_per_day_paise?: number | null
          extra_per_month_paise?: number | null
          id?: string
          offered_at?: string
          partner_id?: string
          projected_extra_earnings?: number | null
          queue_id?: string
          responded_at?: string | null
          response?: string
          route_delta_seconds?: number | null
          scope?: string
          score?: number | null
          score_breakdown?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "subscription_offers_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_offers_queue_id_fkey"
            columns: ["queue_id"]
            isOneToOne: false
            referencedRelation: "subscription_assignment_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_pauses: {
        Row: {
          booking_id: string | null
          created_at: string
          days_extended: number
          end_date: string
          id: string
          notes: string | null
          reason: string
          start_date: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          days_extended?: number
          end_date: string
          id?: string
          notes?: string | null
          reason: string
          start_date: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          days_extended?: number
          end_date?: string
          id?: string
          notes?: string | null
          reason?: string
          start_date?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_pauses_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          amount: number
          assigned_at: string | null
          assigned_partner_id: string | null
          booking_id: string
          created_at: string
          currency: string
          customer_id: string
          id: string
          plan_slug: string
          renewal_date: string
          service_start_date: string | null
          start_date: string
          status: string
          updated_at: string
          user_id: string
          vehicle_id: string | null
        }
        Insert: {
          amount?: number
          assigned_at?: string | null
          assigned_partner_id?: string | null
          booking_id: string
          created_at?: string
          currency?: string
          customer_id: string
          id?: string
          plan_slug?: string
          renewal_date: string
          service_start_date?: string | null
          start_date?: string
          status?: string
          updated_at?: string
          user_id: string
          vehicle_id?: string | null
        }
        Update: {
          amount?: number
          assigned_at?: string | null
          assigned_partner_id?: string | null
          booking_id?: string
          created_at?: string
          currency?: string
          customer_id?: string
          id?: string
          plan_slug?: string
          renewal_date?: string
          service_start_date?: string | null
          start_date?: string
          status?: string
          updated_at?: string
          user_id?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_assigned_partner_id_fkey"
            columns: ["assigned_partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      training_modules: {
        Row: {
          category: string
          content: Json | null
          created_at: string
          description: string | null
          duration_minutes: number
          id: string
          slug: string
          sort_order: number
          title: string
          video_url: string | null
        }
        Insert: {
          category: string
          content?: Json | null
          created_at?: string
          description?: string | null
          duration_minutes?: number
          id?: string
          slug: string
          sort_order?: number
          title: string
          video_url?: string | null
        }
        Update: {
          category?: string
          content?: Json | null
          created_at?: string
          description?: string | null
          duration_minutes?: number
          id?: string
          slug?: string
          sort_order?: number
          title?: string
          video_url?: string | null
        }
        Relationships: []
      }
      training_progress: {
        Row: {
          completed_at: string
          id: string
          module_id: string
          partner_id: string
        }
        Insert: {
          completed_at?: string
          id?: string
          module_id: string
          partner_id: string
        }
        Update: {
          completed_at?: string
          id?: string
          module_id?: string
          partner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_progress_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "training_modules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_progress_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      unavailability_penalties: {
        Row: {
          assignment_id: string | null
          created_at: string
          day_earnings_lost: number
          for_date: string
          id: string
          partner_id: string
          penalty_amount: number
        }
        Insert: {
          assignment_id?: string | null
          created_at?: string
          day_earnings_lost?: number
          for_date?: string
          id?: string
          partner_id: string
          penalty_amount?: number
        }
        Update: {
          assignment_id?: string | null
          created_at?: string
          day_earnings_lost?: number
          for_date?: string
          id?: string
          partner_id?: string
          penalty_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "unavailability_penalties_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unavailability_penalties_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      unavailability_reports: {
        Row: {
          created_at: string
          credited_amount: number
          customer_id: string
          id: string
          lat: number | null
          lng: number | null
          notes: string | null
          partner_id: string
          photo_path: string | null
          reason: string
          service_id: string
        }
        Insert: {
          created_at?: string
          credited_amount?: number
          customer_id: string
          id?: string
          lat?: number | null
          lng?: number | null
          notes?: string | null
          partner_id: string
          photo_path?: string | null
          reason: string
          service_id: string
        }
        Update: {
          created_at?: string
          credited_amount?: number
          customer_id?: string
          id?: string
          lat?: number | null
          lng?: number | null
          notes?: string | null
          partner_id?: string
          photo_path?: string | null
          reason?: string
          service_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "unavailability_reports_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vehicle_catalog: {
        Row: {
          active: boolean
          category: string
          created_at: string
          id: string
          image_url: string | null
          make: string
          model: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          category: string
          created_at?: string
          id?: string
          image_url?: string | null
          make: string
          model: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          category?: string
          created_at?: string
          id?: string
          image_url?: string | null
          make?: string
          model?: string
          updated_at?: string
        }
        Relationships: []
      }
      vehicles: {
        Row: {
          color: string | null
          created_at: string
          customer_id: string
          front_image_path: string | null
          id: string
          make: string
          model: string
          package_amount: number | null
          parking_notes: string | null
          registration_number: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          customer_id: string
          front_image_path?: string | null
          id?: string
          make: string
          model: string
          package_amount?: number | null
          parking_notes?: string | null
          registration_number: string
        }
        Update: {
          color?: string | null
          created_at?: string
          customer_id?: string
          front_image_path?: string | null
          id?: string
          make?: string
          model?: string
          package_amount?: number | null
          parking_notes?: string | null
          registration_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_ledger: {
        Row: {
          amount: number
          assignment_id: string | null
          balance_after: number | null
          created_at: string
          description: string | null
          entry_type: string
          id: string
          partner_id: string
          service_id: string | null
        }
        Insert: {
          amount: number
          assignment_id?: string | null
          balance_after?: number | null
          created_at?: string
          description?: string | null
          entry_type: string
          id?: string
          partner_id: string
          service_id?: string | null
        }
        Update: {
          amount?: number
          assignment_id?: string | null
          balance_after?: number | null
          created_at?: string
          description?: string | null
          entry_type?: string
          id?: string
          partner_id?: string
          service_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wallet_ledger_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_ledger_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_ledger_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_live_ops_today: {
        Row: {
          assigned_today: number | null
          completed_today: number | null
          dirty_today: number | null
          fraud_flags_week: number | null
          parking_today: number | null
          pending_today: number | null
          unavailable_today: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      accept_assignment: { Args: { p_target_cars: number }; Returns: string }
      accept_assignment_v2: {
        Args: { p_cars: number; p_duration: number }
        Returns: string
      }
      activate_paid_booking: {
        Args: {
          p_booking_id: string
          p_provider_order_id?: string
          p_provider_payment_id?: string
          p_raw_payload?: Json
          p_signature?: string
        }
        Returns: Json
      }
      admin_cancel_assignment: {
        Args: { p_assignment_id: string; p_note?: string }
        Returns: undefined
      }
      admin_cancel_queue: {
        Args: { p_queue_id: string; p_reason?: string }
        Returns: Json
      }
      admin_create_manual_assignment: {
        Args: {
          p_customer_ids: string[]
          p_duration: number
          p_partner_id: string
        }
        Returns: string
      }
      admin_extend_customer: {
        Args: { p_customer_id: string; p_days: number; p_reason: string }
        Returns: Json
      }
      admin_force_assign_queue: {
        Args: { p_partner_id: string; p_queue_id: string }
        Returns: Json
      }
      admin_list_unassigned_customers: {
        Args: { p_area?: string }
        Returns: {
          area: string
          full_name: string
          id: string
          phone: string
          preferred_time: string
          registration_number: string
          subscription_end: string
          vehicle_make: string
          vehicle_model: string
        }[]
      }
      admin_mark_monthly_wash: {
        Args: {
          p_customer_id: string
          p_done_date: string
          p_kind: string
          p_partner_id: string
        }
        Returns: undefined
      }
      admin_retry_queue: { Args: { p_queue_id: string }; Returns: Json }
      admin_revenue_customers: {
        Args: never
        Returns: {
          amount: number
          area: string
          full_name: string
          id: string
          is_active: boolean
          paid_at: string
          payment_status: string
          subscription_end: string
        }[]
      }
      admin_revenue_summary: {
        Args: never
        Returns: {
          active_customers: number
          expected_revenue: number
          paid_count: number
          paid_revenue: number
          pending_count: number
          pending_revenue: number
          total_customers: number
        }[]
      }
      admin_set_customer_payment: {
        Args: { p_id: string; p_status: string }
        Returns: undefined
      }
      admin_update_customer: {
        Args: {
          p_address_line: string
          p_area: string
          p_front_image_path?: string
          p_full_name: string
          p_id: string
          p_is_active: boolean
          p_latitude: number
          p_longitude: number
          p_package_amount?: number
          p_phone: string
          p_pincode: string
          p_preferred_time: string
          p_service_required_before: string
          p_subscription_end: string
          p_subscription_plan: string
          p_subscription_start: string
        }
        Returns: undefined
      }
      admin_update_partner: {
        Args: {
          p_aadhaar_number?: string
          p_aadhaar_verified?: boolean
          p_bank_account_number?: string
          p_bank_ifsc?: string
          p_bank_verified?: boolean
          p_full_name?: string
          p_home_area?: string
          p_id: string
          p_level?: string
          p_lifetime_earnings?: number
          p_pan_number?: string
          p_pan_verified?: boolean
          p_phone?: string
          p_rating?: number
          p_status?: string
        }
        Returns: undefined
      }
      available_customers_by_area: {
        Args: never
        Returns: {
          area: string
          available: number
          total_active: number
        }[]
      }
      can_reassign_subscription: {
        Args: { _actor_role: string; _queue_id: string }
        Returns: boolean
      }
      cancel_assignment: {
        Args: { p_assignment_id: string }
        Returns: undefined
      }
      claim_admin_if_empty: { Args: never; Returns: boolean }
      claim_customer: {
        Args: { p_customer_id: string; p_rate?: number }
        Returns: number
      }
      claim_customer_booking: {
        Args: { p_booking_id: string }
        Returns: string
      }
      cleanup_old_service_photos: { Args: never; Returns: Json }
      confirm_customer_booking: {
        Args: {
          p_addons?: Json
          p_address_id: string
          p_coupon_code?: string
          p_notes?: string
          p_scheduled_date: string
          p_scheduled_time: string
          p_service_id: string
          p_vehicle_id: string
        }
        Returns: string
      }
      enqueue_subscription_booking: {
        Args: { p_booking_id: string }
        Returns: string
      }
      ensure_ops_customer_for_booking: {
        Args: { p_booking_id: string }
        Returns: Json
      }
      ensure_staff_login_role: {
        Args: {
          p_full_name?: string
          p_role: Database["public"]["Enums"]["app_role"]
        }
        Returns: boolean
      }
      get_my_service_photo_url: {
        Args: { p_expires?: number; p_storage_path: string }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      haversine_km: {
        Args: { lat1: number; lat2: number; lng1: number; lng2: number }
        Returns: number
      }
      list_assignment_offers: {
        Args: never
        Returns: {
          area: string
          estimated_distance_km: number
          estimated_earnings: number
          estimated_hours: number
          target_cars: number
        }[]
      }
      list_available_customers: {
        Args: never
        Returns: {
          address_line: string
          area: string
          color: string
          customer_id: string
          full_name: string
          latitude: number
          longitude: number
          make: string
          model: string
          parking_notes: string
          pincode: string
          registration_number: string
          vehicle_id: string
        }[]
      }
      list_my_recent_services: {
        Args: { p_days?: number }
        Returns: {
          booking_id: string
          can_complain: boolean
          complaint_window_ends_at: string
          completed_at: string
          dirty_report: Json
          has_complaint: boolean
          partner_id: string
          partner_name: string
          photos: Json
          scheduled_date: string
          service_id: string
          service_name: string
          service_slug: string
          status: string
          unavailable_notes: string
          unavailable_photo: string
          unavailable_reason: string
          vehicle_label: string
        }[]
      }
      list_partner_booking_requests: {
        Args: never
        Returns: {
          address_line: string
          area: string
          booking_id: string
          created_at: string
          customer_name: string
          registration_number: string
          scheduled_date: string
          scheduled_time: string
          service_name: string
          total_amount: number
          vehicle_label: string
        }[]
      }
      log_reliability_event: {
        Args: {
          _assignment_id?: string
          _event_type: Database["public"]["Enums"]["reliability_event_type"]
          _note?: string
          _partner_id: string
          _service_id?: string
        }
        Returns: undefined
      }
      modify_assignment: {
        Args: { p_assignment_id: string; p_delta: number }
        Returns: Json
      }
      offer_next_for_queue: { Args: { p_queue_id: string }; Returns: string }
      partner_reliability: { Args: { p_partner_id: string }; Returns: Json }
      pick_next_partner_for_queue: {
        Args: { p_queue_id: string; p_radius_km?: number; p_scope?: string }
        Returns: string
      }
      pick_scored_partner_for_queue: {
        Args: { p_queue_id: string; p_radius_km?: number; p_scope?: string }
        Returns: {
          dist_km: number
          distance_from_route_m: number
          partner_id: string
          route_delta_sec: number
          score: number
          score_breakdown: Json
        }[]
      }
      preview_assignment: {
        Args: { p_cars: number; p_duration: number }
        Returns: {
          available_customers: number
          cars: number
          daily_earnings: number
          duration_days: number
          estimated_hours: number
          estimated_radius_km: number
          expected_end_time: string
          expected_start_time: string
          message: string
          total_earnings: number
          working_days: number
        }[]
      }
      respond_subscription_offer: {
        Args: { p_accept: boolean; p_offer_id: string }
        Returns: Json
      }
      schedule_plan_services_recurring: {
        Args: {
          p_address_id: string
          p_occurrences: number
          p_scheduled_time: string
          p_service_id: string
          p_start_date: string
          p_vehicle_id: string
          p_weekday: number
        }
        Returns: string[]
      }
      set_partner_area: {
        Args: { p_area: string; p_lat: number; p_lng: number }
        Returns: undefined
      }
      submit_parking_issue: {
        Args: {
          p_lat: number
          p_lng: number
          p_notes: string
          p_photo: string
          p_reason: string
          p_service_id: string
        }
        Returns: Json
      }
      submit_service_complaint: {
        Args: {
          p_complaint_type: string
          p_description: string
          p_service_id: string
        }
        Returns: string
      }
      submit_service_unavailable: {
        Args: {
          p_lat: number
          p_lng: number
          p_notes: string
          p_photo: string
          p_reason: string
          p_service_id: string
        }
        Returns: Json
      }
      sweep_subscription_offers: { Args: never; Returns: number }
    }
    Enums: {
      app_role: "admin" | "supervisor" | "partner" | "customer"
      availability_status: "online" | "offline" | "leave" | "emergency_leave"
      complaint_status: "open" | "investigating" | "resolved" | "dismissed"
      partner_status:
        | "pending_verification"
        | "active"
        | "suspended"
        | "offline"
      payout_status: "pending" | "processing" | "paid" | "failed"
      photo_angle: "front" | "rear" | "left" | "right"
      photo_stage: "before" | "after"
      reliability_event_type:
        | "assignment_accepted"
        | "service_completed"
        | "on_time_service"
        | "customer_complaint"
        | "missed_service"
        | "assignment_cancelled"
        | "repeated_unavailability"
      service_status:
        | "pending"
        | "in_progress"
        | "completed"
        | "unavailable"
        | "skipped"
      subscription_plan:
        | "daily_shine_monthly"
        | "daily_shine_quarterly"
        | "daily_shine_yearly"
      unavailable_reason:
        | "vehicle_not_available"
        | "parking_locked"
        | "customer_asked_to_skip"
        | "access_not_available"
        | "customer_not_responding"
        | "dirty_vehicle"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "supervisor", "partner", "customer"],
      availability_status: ["online", "offline", "leave", "emergency_leave"],
      complaint_status: ["open", "investigating", "resolved", "dismissed"],
      partner_status: [
        "pending_verification",
        "active",
        "suspended",
        "offline",
      ],
      payout_status: ["pending", "processing", "paid", "failed"],
      photo_angle: ["front", "rear", "left", "right"],
      photo_stage: ["before", "after"],
      reliability_event_type: [
        "assignment_accepted",
        "service_completed",
        "on_time_service",
        "customer_complaint",
        "missed_service",
        "assignment_cancelled",
        "repeated_unavailability",
      ],
      service_status: [
        "pending",
        "in_progress",
        "completed",
        "unavailable",
        "skipped",
      ],
      subscription_plan: [
        "daily_shine_monthly",
        "daily_shine_quarterly",
        "daily_shine_yearly",
      ],
      unavailable_reason: [
        "vehicle_not_available",
        "parking_locked",
        "customer_asked_to_skip",
        "access_not_available",
        "customer_not_responding",
        "dirty_vehicle",
      ],
    },
  },
} as const
