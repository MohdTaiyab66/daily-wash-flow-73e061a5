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
      admin_alerts: {
        Row: {
          body: string | null
          created_at: string
          id: string
          kind: string
          meta: Json
          pushed_at: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          title: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          kind: string
          meta?: Json
          pushed_at?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          title: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          kind?: string
          meta?: Json
          pushed_at?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          title?: string
        }
        Relationships: []
      }
      admin_notifications: {
        Row: {
          body: string | null
          category: string
          created_at: string
          id: string
          link: string | null
          metadata: Json
          pushed_at: string | null
          read_at: string | null
          subject_id: string | null
          subject_type: string | null
          title: string
        }
        Insert: {
          body?: string | null
          category?: string
          created_at?: string
          id?: string
          link?: string | null
          metadata?: Json
          pushed_at?: string | null
          read_at?: string | null
          subject_id?: string | null
          subject_type?: string | null
          title: string
        }
        Update: {
          body?: string | null
          category?: string
          created_at?: string
          id?: string
          link?: string | null
          metadata?: Json
          pushed_at?: string | null
          read_at?: string | null
          subject_id?: string | null
          subject_type?: string | null
          title?: string
        }
        Relationships: []
      }
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
            foreignKeyName: "assignment_changes_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "v_assignment_pipeline_trace"
            referencedColumns: ["assignment_id"]
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
      assignment_integrity_audit: {
        Row: {
          assignment_id: string | null
          created_at: string
          id: string
          mismatches: string[]
          partner_id: string | null
          services_missing_customer: number
          services_wrong_partner: number
          source: string | null
          todays_customers: number
          todays_services: number
          total_services: number
          user_agent: string | null
        }
        Insert: {
          assignment_id?: string | null
          created_at?: string
          id?: string
          mismatches?: string[]
          partner_id?: string | null
          services_missing_customer?: number
          services_wrong_partner?: number
          source?: string | null
          todays_customers?: number
          todays_services?: number
          total_services?: number
          user_agent?: string | null
        }
        Update: {
          assignment_id?: string | null
          created_at?: string
          id?: string
          mismatches?: string[]
          partner_id?: string | null
          services_missing_customer?: number
          services_wrong_partner?: number
          source?: string | null
          todays_customers?: number
          todays_services?: number
          total_services?: number
          user_agent?: string | null
        }
        Relationships: []
      }
      assignments: {
        Row: {
          accepted_at: string
          area: string
          auto_renew: boolean
          completed_at: string | null
          created_at: string
          duration_days: number
          end_date: string
          estimated_distance_km: number
          estimated_earnings: number
          estimated_hours: number
          expected_start_time: string
          fulfilled_cars: number
          hours_per_day: number | null
          id: string
          last_modified_at: string | null
          modification_count: number
          original_duration_days: number | null
          partner_id: string
          rate_per_car: number
          route_visibility_hours: number | null
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
          auto_renew?: boolean
          completed_at?: string | null
          created_at?: string
          duration_days?: number
          end_date?: string
          estimated_distance_km: number
          estimated_earnings: number
          estimated_hours: number
          expected_start_time?: string
          fulfilled_cars?: number
          hours_per_day?: number | null
          id?: string
          last_modified_at?: string | null
          modification_count?: number
          original_duration_days?: number | null
          partner_id: string
          rate_per_car?: number
          route_visibility_hours?: number | null
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
          auto_renew?: boolean
          completed_at?: string | null
          created_at?: string
          duration_days?: number
          end_date?: string
          estimated_distance_km?: number
          estimated_earnings?: number
          estimated_hours?: number
          expected_start_time?: string
          fulfilled_cars?: number
          hours_per_day?: number | null
          id?: string
          last_modified_at?: string | null
          modification_count?: number
          original_duration_days?: number | null
          partner_id?: string
          rate_per_car?: number
          route_visibility_hours?: number | null
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
          {
            foreignKeyName: "booking_addons_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_admin_notification_trace"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "booking_addons_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_assignment_pipeline_trace"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "booking_addons_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_offer_debug"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "booking_addons_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_payment_pipeline_timeline"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "booking_addons_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_pipeline_metrics"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "booking_addons_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_vehicle_audit"
            referencedColumns: ["booking_id"]
          },
        ]
      }
      bookings: {
        Row: {
          addon_amount: number
          address_id: string | null
          base_amount: number
          claimed_at: string | null
          coupon_code: string | null
          created_at: string
          discount_amount: number
          gps_source: string | null
          id: string
          latitude: number | null
          longitude: number | null
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
          coupon_code?: string | null
          created_at?: string
          discount_amount?: number
          gps_source?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
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
          coupon_code?: string | null
          created_at?: string
          discount_amount?: number
          gps_source?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
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
            foreignKeyName: "bookings_ops_service_id_fkey"
            columns: ["ops_service_id"]
            isOneToOne: false
            referencedRelation: "v_vehicle_audit"
            referencedColumns: ["service_id"]
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
      checkout_holds: {
        Row: {
          acquired_at: string
          booking_id: string
          expires_at: string
          holder_id: string
          reason: string
          user_id: string
        }
        Insert: {
          acquired_at?: string
          booking_id: string
          expires_at: string
          holder_id: string
          reason?: string
          user_id: string
        }
        Update: {
          acquired_at?: string
          booking_id?: string
          expires_at?: string
          holder_id?: string
          reason?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checkout_holds_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkout_holds_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "v_admin_notification_trace"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "checkout_holds_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "v_assignment_pipeline_trace"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "checkout_holds_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "v_offer_debug"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "checkout_holds_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "v_payment_pipeline_timeline"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "checkout_holds_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "v_pipeline_metrics"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "checkout_holds_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "v_vehicle_audit"
            referencedColumns: ["booking_id"]
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
          {
            foreignKeyName: "complaints_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "v_vehicle_audit"
            referencedColumns: ["service_id"]
          },
        ]
      }
      coverage_alerts: {
        Row: {
          created_at: string
          id: string
          kind: string
          message: string | null
          payload: Json | null
          resolved_at: string | null
          severity: string
          zone_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          message?: string | null
          payload?: Json | null
          resolved_at?: string | null
          severity?: string
          zone_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          message?: string | null
          payload?: Json | null
          resolved_at?: string | null
          severity?: string
          zone_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coverage_alerts_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "coverage_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      coverage_zone_calendar: {
        Row: {
          created_at: string
          created_by: string | null
          daily_shine_on: boolean
          date_from: string | null
          date_to: string | null
          id: string
          premium_on: boolean
          reason: string | null
          recurring_dow: number[] | null
          zone_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          daily_shine_on?: boolean
          date_from?: string | null
          date_to?: string | null
          id?: string
          premium_on?: boolean
          reason?: string | null
          recurring_dow?: number[] | null
          zone_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          daily_shine_on?: boolean
          date_from?: string | null
          date_to?: string | null
          id?: string
          premium_on?: boolean
          reason?: string | null
          recurring_dow?: number[] | null
          zone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coverage_zone_calendar_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "coverage_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      coverage_zone_history: {
        Row: {
          action: string
          after: Json | null
          at: string
          before: Json | null
          id: string
          operator: string | null
          reason: string | null
          zone_id: string | null
        }
        Insert: {
          action: string
          after?: Json | null
          at?: string
          before?: Json | null
          id?: string
          operator?: string | null
          reason?: string | null
          zone_id?: string | null
        }
        Update: {
          action?: string
          after?: Json | null
          at?: string
          before?: Json | null
          id?: string
          operator?: string | null
          reason?: string | null
          zone_id?: string | null
        }
        Relationships: []
      }
      coverage_zones: {
        Row: {
          assignment_radius_m: number | null
          backup_partner_ids: string[]
          backup_team_id: string | null
          bbox_max_lat: number | null
          bbox_max_lng: number | null
          bbox_min_lat: number | null
          bbox_min_lng: number | null
          center_lat: number | null
          center_lng: number | null
          city: string | null
          color: string
          corporate_fleet_enabled: boolean
          created_at: string
          cutter_polish_enabled: boolean
          daily_shine_enabled: boolean
          deep_clean_enabled: boolean
          emergency_enabled: boolean
          exterior_enabled: boolean
          finish_time: string
          id: string
          int_ext_enabled: boolean
          interior_enabled: boolean
          max_active_partners: number | null
          max_cars_per_partner: number
          max_customers: number | null
          max_daily_capacity: number | null
          max_route_distance_km: number
          max_services: number | null
          max_travel_time_min: number
          name: string
          neighbour_expand: boolean
          polish_enabled: boolean
          polygon: Json | null
          preferred_partner_ids: string[]
          premium_enabled: boolean
          primary_team_id: string | null
          priority: number
          radius_m: number | null
          roof_cleaning_enabled: boolean
          route_optimization_radius_m: number | null
          seat_cleaning_enabled: boolean
          start_time: string
          status: string
          travel_buffer_min: number | null
          updated_at: string
          washing_enabled: boolean
          zone_type: string
        }
        Insert: {
          assignment_radius_m?: number | null
          backup_partner_ids?: string[]
          backup_team_id?: string | null
          bbox_max_lat?: number | null
          bbox_max_lng?: number | null
          bbox_min_lat?: number | null
          bbox_min_lng?: number | null
          center_lat?: number | null
          center_lng?: number | null
          city?: string | null
          color?: string
          corporate_fleet_enabled?: boolean
          created_at?: string
          cutter_polish_enabled?: boolean
          daily_shine_enabled?: boolean
          deep_clean_enabled?: boolean
          emergency_enabled?: boolean
          exterior_enabled?: boolean
          finish_time?: string
          id?: string
          int_ext_enabled?: boolean
          interior_enabled?: boolean
          max_active_partners?: number | null
          max_cars_per_partner?: number
          max_customers?: number | null
          max_daily_capacity?: number | null
          max_route_distance_km?: number
          max_services?: number | null
          max_travel_time_min?: number
          name: string
          neighbour_expand?: boolean
          polish_enabled?: boolean
          polygon?: Json | null
          preferred_partner_ids?: string[]
          premium_enabled?: boolean
          primary_team_id?: string | null
          priority?: number
          radius_m?: number | null
          roof_cleaning_enabled?: boolean
          route_optimization_radius_m?: number | null
          seat_cleaning_enabled?: boolean
          start_time?: string
          status?: string
          travel_buffer_min?: number | null
          updated_at?: string
          washing_enabled?: boolean
          zone_type: string
        }
        Update: {
          assignment_radius_m?: number | null
          backup_partner_ids?: string[]
          backup_team_id?: string | null
          bbox_max_lat?: number | null
          bbox_max_lng?: number | null
          bbox_min_lat?: number | null
          bbox_min_lng?: number | null
          center_lat?: number | null
          center_lng?: number | null
          city?: string | null
          color?: string
          corporate_fleet_enabled?: boolean
          created_at?: string
          cutter_polish_enabled?: boolean
          daily_shine_enabled?: boolean
          deep_clean_enabled?: boolean
          emergency_enabled?: boolean
          exterior_enabled?: boolean
          finish_time?: string
          id?: string
          int_ext_enabled?: boolean
          interior_enabled?: boolean
          max_active_partners?: number | null
          max_cars_per_partner?: number
          max_customers?: number | null
          max_daily_capacity?: number | null
          max_route_distance_km?: number
          max_services?: number | null
          max_travel_time_min?: number
          name?: string
          neighbour_expand?: boolean
          polish_enabled?: boolean
          polygon?: Json | null
          preferred_partner_ids?: string[]
          premium_enabled?: boolean
          primary_team_id?: string | null
          priority?: number
          radius_m?: number | null
          roof_cleaning_enabled?: boolean
          route_optimization_radius_m?: number | null
          seat_cleaning_enabled?: boolean
          start_time?: string
          status?: string
          travel_buffer_min?: number | null
          updated_at?: string
          washing_enabled?: boolean
          zone_type?: string
        }
        Relationships: []
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
          category: string
          created_at: string
          id: string
          link: string | null
          metadata: Json
          pushed_at: string | null
          read_at: string | null
          title: string
          type: string
          user_id: string
          vehicle_id: string | null
        }
        Insert: {
          body?: string | null
          category?: string
          created_at?: string
          id?: string
          link?: string | null
          metadata?: Json
          pushed_at?: string | null
          read_at?: string | null
          title: string
          type: string
          user_id: string
          vehicle_id?: string | null
        }
        Update: {
          body?: string | null
          category?: string
          created_at?: string
          id?: string
          link?: string | null
          metadata?: Json
          pushed_at?: string | null
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_notifications_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "customer_vehicles"
            referencedColumns: ["id"]
          },
        ]
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
      customer_saved_packages: {
        Row: {
          addons: Json
          base_plan_price: number
          base_plan_slug: string
          created_at: string
          id: string
          name: string
          total_monthly: number
          updated_at: string
          user_id: string
        }
        Insert: {
          addons?: Json
          base_plan_price?: number
          base_plan_slug: string
          created_at?: string
          id?: string
          name: string
          total_monthly?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          addons?: Json
          base_plan_price?: number
          base_plan_slug?: string
          created_at?: string
          id?: string
          name?: string
          total_monthly?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      customer_vehicles: {
        Row: {
          category: string
          color: string | null
          created_at: string
          discount_approved: boolean
          discount_approved_at: string | null
          discount_approved_by: string | null
          id: string
          image_path: string | null
          is_default: boolean
          make: string
          model: string
          nickname: string | null
          parking_notes: string | null
          registration_number: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category: string
          color?: string | null
          created_at?: string
          discount_approved?: boolean
          discount_approved_at?: string | null
          discount_approved_by?: string | null
          id?: string
          image_path?: string | null
          is_default?: boolean
          make: string
          model: string
          nickname?: string | null
          parking_notes?: string | null
          registration_number: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          color?: string | null
          created_at?: string
          discount_approved?: boolean
          discount_approved_at?: string | null
          discount_approved_by?: string | null
          id?: string
          image_path?: string | null
          is_default?: boolean
          make?: string
          model?: string
          nickname?: string | null
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
          exact_time: string | null
          exterior_wash_done_date: string | null
          exterior_wash_partner_id: string | null
          full_name: string
          gps_source: string | null
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
          time_window_type: string
          updated_at: string
        }
        Insert: {
          address_line: string
          area?: string | null
          city?: string
          created_at?: string
          email?: string | null
          exact_time?: string | null
          exterior_wash_done_date?: string | null
          exterior_wash_partner_id?: string | null
          full_name: string
          gps_source?: string | null
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
          time_window_type?: string
          updated_at?: string
        }
        Update: {
          address_line?: string
          area?: string | null
          city?: string
          created_at?: string
          email?: string | null
          exact_time?: string | null
          exterior_wash_done_date?: string | null
          exterior_wash_partner_id?: string | null
          full_name?: string
          gps_source?: string | null
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
          time_window_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      dar_events: {
        Row: {
          affected_count: number
          affected_service_ids: string[]
          created_at: string
          id: string
          notes: string | null
          partner_id: string
          reason: string
          recovered_count: number
          resolved_at: string | null
          scheduled_date: string
          status: string
          triggered_at: string
        }
        Insert: {
          affected_count?: number
          affected_service_ids?: string[]
          created_at?: string
          id?: string
          notes?: string | null
          partner_id: string
          reason: string
          recovered_count?: number
          resolved_at?: string | null
          scheduled_date?: string
          status?: string
          triggered_at?: string
        }
        Update: {
          affected_count?: number
          affected_service_ids?: string[]
          created_at?: string
          id?: string
          notes?: string | null
          partner_id?: string
          reason?: string
          recovered_count?: number
          resolved_at?: string | null
          scheduled_date?: string
          status?: string
          triggered_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dar_events_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      dar_offers: {
        Row: {
          accepted_service_ids: string[]
          created_at: string
          event_id: string
          expires_at: string
          extra_distance_km: number
          extra_monthly_earnings: number
          extra_time_min: number
          id: string
          partner_id: string
          responded_at: string | null
          score: number
          sent_at: string
          service_count: number
          service_ids: string[]
          status: string
        }
        Insert: {
          accepted_service_ids?: string[]
          created_at?: string
          event_id: string
          expires_at?: string
          extra_distance_km?: number
          extra_monthly_earnings?: number
          extra_time_min?: number
          id?: string
          partner_id: string
          responded_at?: string | null
          score?: number
          sent_at?: string
          service_count?: number
          service_ids?: string[]
          status?: string
        }
        Update: {
          accepted_service_ids?: string[]
          created_at?: string
          event_id?: string
          expires_at?: string
          extra_distance_km?: number
          extra_monthly_earnings?: number
          extra_time_min?: number
          id?: string
          partner_id?: string
          responded_at?: string | null
          score?: number
          sent_at?: string
          service_count?: number
          service_ids?: string[]
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "dar_offers_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "dar_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dar_offers_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      deprecated_call_log: {
        Row: {
          args: Json
          called_at: string
          caller_user_id: string | null
          fn_name: string
          id: string
        }
        Insert: {
          args?: Json
          called_at?: string
          caller_user_id?: string | null
          fn_name: string
          id?: string
        }
        Update: {
          args?: Json
          called_at?: string
          caller_user_id?: string | null
          fn_name?: string
          id?: string
        }
        Relationships: []
      }
      dirty_vehicle_reports: {
        Row: {
          captured_at: string
          created_at: string
          customer_id: string | null
          id: string
          lat: number | null
          lng: number | null
          notes: string | null
          partner_id: string
          photo_front: string | null
          photo_left: string | null
          photo_rear: string | null
          photo_right: string | null
          reason: string
          recommendation: string
          service_id: string
        }
        Insert: {
          captured_at?: string
          created_at?: string
          customer_id?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          notes?: string | null
          partner_id: string
          photo_front?: string | null
          photo_left?: string | null
          photo_rear?: string | null
          photo_right?: string | null
          reason: string
          recommendation?: string
          service_id: string
        }
        Update: {
          captured_at?: string
          created_at?: string
          customer_id?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          notes?: string | null
          partner_id?: string
          photo_front?: string | null
          photo_left?: string | null
          photo_rear?: string | null
          photo_right?: string | null
          reason?: string
          recommendation?: string
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
          {
            foreignKeyName: "dirty_vehicle_reports_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "v_vehicle_audit"
            referencedColumns: ["service_id"]
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
      entitlement_ledger: {
        Row: {
          actor_user_id: string | null
          addon_request_id: string | null
          benefit_type: Database["public"]["Enums"]["benefit_type"]
          booking_id: string | null
          created_at: string
          delta: number
          entitlement_id: string
          id: string
          reason: string | null
          subscription_id: string
          vehicle_id: string
        }
        Insert: {
          actor_user_id?: string | null
          addon_request_id?: string | null
          benefit_type: Database["public"]["Enums"]["benefit_type"]
          booking_id?: string | null
          created_at?: string
          delta: number
          entitlement_id: string
          id?: string
          reason?: string | null
          subscription_id: string
          vehicle_id: string
        }
        Update: {
          actor_user_id?: string | null
          addon_request_id?: string | null
          benefit_type?: Database["public"]["Enums"]["benefit_type"]
          booking_id?: string | null
          created_at?: string
          delta?: number
          entitlement_id?: string
          id?: string
          reason?: string | null
          subscription_id?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entitlement_ledger_entitlement_id_fkey"
            columns: ["entitlement_id"]
            isOneToOne: false
            referencedRelation: "subscription_entitlements"
            referencedColumns: ["id"]
          },
        ]
      }
      expansion_requests: {
        Row: {
          area_name: string | null
          created_at: string
          customer_id: string | null
          id: string
          interested_service: string | null
          lat: number | null
          lng: number | null
          notes: string | null
          phone: string | null
          pincode: string | null
          status: string
        }
        Insert: {
          area_name?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          interested_service?: string | null
          lat?: number | null
          lng?: number | null
          notes?: string | null
          phone?: string | null
          pincode?: string | null
          status?: string
        }
        Update: {
          area_name?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          interested_service?: string | null
          lat?: number | null
          lng?: number | null
          notes?: string | null
          phone?: string | null
          pincode?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "expansion_requests_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_broadcasts: {
        Row: {
          assignment_id: string | null
          booking_id: string | null
          created_at: string
          current_incentive: number
          current_radius_m: number
          current_round: number
          customer_id: string
          customer_lat: number | null
          customer_lng: number | null
          id: string
          round_expires_at: string
          round_started_at: string
          service_area_id: string | null
          status: string
          subscription_id: string
          updated_at: string
          vehicle_id: string | null
          winning_partner_id: string | null
        }
        Insert: {
          assignment_id?: string | null
          booking_id?: string | null
          created_at?: string
          current_incentive?: number
          current_radius_m?: number
          current_round?: number
          customer_id: string
          customer_lat?: number | null
          customer_lng?: number | null
          id?: string
          round_expires_at?: string
          round_started_at?: string
          service_area_id?: string | null
          status?: string
          subscription_id: string
          updated_at?: string
          vehicle_id?: string | null
          winning_partner_id?: string | null
        }
        Update: {
          assignment_id?: string | null
          booking_id?: string | null
          created_at?: string
          current_incentive?: number
          current_radius_m?: number
          current_round?: number
          customer_id?: string
          customer_lat?: number | null
          customer_lng?: number | null
          id?: string
          round_expires_at?: string
          round_started_at?: string
          service_area_id?: string | null
          status?: string
          subscription_id?: string
          updated_at?: string
          vehicle_id?: string | null
          winning_partner_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_broadcasts_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_broadcasts_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "v_assignment_pipeline_trace"
            referencedColumns: ["assignment_id"]
          },
          {
            foreignKeyName: "marketplace_broadcasts_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_broadcasts_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_admin_notification_trace"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "marketplace_broadcasts_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_assignment_pipeline_trace"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "marketplace_broadcasts_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_offer_debug"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "marketplace_broadcasts_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_payment_pipeline_timeline"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "marketplace_broadcasts_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_pipeline_metrics"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "marketplace_broadcasts_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_vehicle_audit"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "marketplace_broadcasts_service_area_id_fkey"
            columns: ["service_area_id"]
            isOneToOne: false
            referencedRelation: "coverage_zones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_broadcasts_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_broadcasts_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "v_admin_notification_trace"
            referencedColumns: ["subscription_id"]
          },
          {
            foreignKeyName: "marketplace_broadcasts_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "v_assignment_pipeline_trace"
            referencedColumns: ["subscription_id"]
          },
          {
            foreignKeyName: "marketplace_broadcasts_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "v_payment_pipeline_timeline"
            referencedColumns: ["subscription_id"]
          },
          {
            foreignKeyName: "marketplace_broadcasts_winning_partner_id_fkey"
            columns: ["winning_partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_delivery_events: {
        Row: {
          broadcast_id: string | null
          created_at: string
          id: string
          meta: Json
          offer_id: string | null
          partner_id: string | null
          stage: string
        }
        Insert: {
          broadcast_id?: string | null
          created_at?: string
          id?: string
          meta?: Json
          offer_id?: string | null
          partner_id?: string | null
          stage: string
        }
        Update: {
          broadcast_id?: string | null
          created_at?: string
          id?: string
          meta?: Json
          offer_id?: string | null
          partner_id?: string | null
          stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_delivery_events_broadcast_id_fkey"
            columns: ["broadcast_id"]
            isOneToOne: false
            referencedRelation: "marketplace_broadcasts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_delivery_events_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "marketplace_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_delivery_events_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_offers: {
        Row: {
          broadcast_id: string
          distance_from_route_m: number | null
          id: string
          incentive: number
          partner_id: string
          responded_at: string | null
          response: string
          round: number
          route_impact_m: number | null
          sent_at: string
          viewed_at: string | null
        }
        Insert: {
          broadcast_id: string
          distance_from_route_m?: number | null
          id?: string
          incentive: number
          partner_id: string
          responded_at?: string | null
          response?: string
          round?: number
          route_impact_m?: number | null
          sent_at?: string
          viewed_at?: string | null
        }
        Update: {
          broadcast_id?: string
          distance_from_route_m?: number | null
          id?: string
          incentive?: number
          partner_id?: string
          responded_at?: string | null
          response?: string
          round?: number
          route_impact_m?: number | null
          sent_at?: string
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_offers_broadcast_id_fkey"
            columns: ["broadcast_id"]
            isOneToOne: false
            referencedRelation: "marketplace_broadcasts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_offers_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_round_history: {
        Row: {
          broadcast_id: string
          ended_at: string | null
          id: string
          incentive: number
          offers_sent: number
          radius_m: number
          reason: string | null
          round: number
          started_at: string
        }
        Insert: {
          broadcast_id: string
          ended_at?: string | null
          id?: string
          incentive: number
          offers_sent?: number
          radius_m: number
          reason?: string | null
          round: number
          started_at?: string
        }
        Update: {
          broadcast_id?: string
          ended_at?: string | null
          id?: string
          incentive?: number
          offers_sent?: number
          radius_m?: number
          reason?: string | null
          round?: number
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_round_history_broadcast_id_fkey"
            columns: ["broadcast_id"]
            isOneToOne: false
            referencedRelation: "marketplace_broadcasts"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_settings: {
        Row: {
          auto_assign_final_round: boolean
          base_incentive: number
          broadcast_enabled: boolean
          countdown_seconds: number
          created_at: string
          expand_radius_enabled: boolean
          full_screen_enabled: boolean
          heads_up_enabled: boolean
          id: boolean
          max_incentive: number
          max_rounds: number
          neighbour_polygon_expansion: boolean
          notification_priority: string
          notification_sound: string
          radius_per_round_m: number[]
          round_duration_sec: number
          round_increments: number[]
          updated_at: string
          vibration_enabled: boolean
        }
        Insert: {
          auto_assign_final_round?: boolean
          base_incentive?: number
          broadcast_enabled?: boolean
          countdown_seconds?: number
          created_at?: string
          expand_radius_enabled?: boolean
          full_screen_enabled?: boolean
          heads_up_enabled?: boolean
          id?: boolean
          max_incentive?: number
          max_rounds?: number
          neighbour_polygon_expansion?: boolean
          notification_priority?: string
          notification_sound?: string
          radius_per_round_m?: number[]
          round_duration_sec?: number
          round_increments?: number[]
          updated_at?: string
          vibration_enabled?: boolean
        }
        Update: {
          auto_assign_final_round?: boolean
          base_incentive?: number
          broadcast_enabled?: boolean
          countdown_seconds?: number
          created_at?: string
          expand_radius_enabled?: boolean
          full_screen_enabled?: boolean
          heads_up_enabled?: boolean
          id?: boolean
          max_incentive?: number
          max_rounds?: number
          neighbour_polygon_expansion?: boolean
          notification_priority?: string
          notification_sound?: string
          radius_per_round_m?: number[]
          round_duration_sec?: number
          round_increments?: number[]
          updated_at?: string
          vibration_enabled?: boolean
        }
        Relationships: []
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
      offer_delivery_events: {
        Row: {
          created_at: string
          id: string
          meta: Json
          offer_id: string | null
          partner_id: string | null
          queue_id: string | null
          stage: string
        }
        Insert: {
          created_at?: string
          id?: string
          meta?: Json
          offer_id?: string | null
          partner_id?: string | null
          queue_id?: string | null
          stage: string
        }
        Update: {
          created_at?: string
          id?: string
          meta?: Json
          offer_id?: string | null
          partner_id?: string | null
          queue_id?: string | null
          stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "offer_delivery_events_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "subscription_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offer_delivery_events_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "v_offer_debug"
            referencedColumns: ["offer_id"]
          },
          {
            foreignKeyName: "offer_delivery_events_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "v_payment_pipeline_timeline"
            referencedColumns: ["first_offer_id"]
          },
          {
            foreignKeyName: "offer_delivery_events_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offer_delivery_events_queue_id_fkey"
            columns: ["queue_id"]
            isOneToOne: false
            referencedRelation: "subscription_assignment_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offer_delivery_events_queue_id_fkey"
            columns: ["queue_id"]
            isOneToOne: false
            referencedRelation: "v_assignment_pipeline_trace"
            referencedColumns: ["queue_id"]
          },
          {
            foreignKeyName: "offer_delivery_events_queue_id_fkey"
            columns: ["queue_id"]
            isOneToOne: false
            referencedRelation: "v_offer_debug"
            referencedColumns: ["queue_id"]
          },
          {
            foreignKeyName: "offer_delivery_events_queue_id_fkey"
            columns: ["queue_id"]
            isOneToOne: false
            referencedRelation: "v_payment_pipeline_timeline"
            referencedColumns: ["queue_id"]
          },
        ]
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
          {
            foreignKeyName: "parking_reports_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "v_vehicle_audit"
            referencedColumns: ["service_id"]
          },
        ]
      }
      partner_apk_workflow_events: {
        Row: {
          accuracy: number | null
          actor_id: string
          app_variant: string
          assignment_id: string | null
          created_at: string
          event_type: string
          id: string
          is_native: boolean
          lat: number | null
          lng: number | null
          payload: Json
          platform: string
          service_id: string | null
          status: string
        }
        Insert: {
          accuracy?: number | null
          actor_id: string
          app_variant?: string
          assignment_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          is_native?: boolean
          lat?: number | null
          lng?: number | null
          payload?: Json
          platform?: string
          service_id?: string | null
          status?: string
        }
        Update: {
          accuracy?: number | null
          actor_id?: string
          app_variant?: string
          assignment_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          is_native?: boolean
          lat?: number | null
          lng?: number | null
          payload?: Json
          platform?: string
          service_id?: string | null
          status?: string
        }
        Relationships: []
      }
      partner_expansion_requests: {
        Row: {
          area_name: string
          created_at: string
          expected_joining_date: string | null
          experience_years: number | null
          full_name: string
          id: string
          latitude: number | null
          longitude: number | null
          notes: string | null
          partner_user_id: string | null
          phone: string
          preferred_cars_per_day: number | null
          status: string
          updated_at: string
          vehicle: string | null
        }
        Insert: {
          area_name: string
          created_at?: string
          expected_joining_date?: string | null
          experience_years?: number | null
          full_name: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          notes?: string | null
          partner_user_id?: string | null
          phone: string
          preferred_cars_per_day?: number | null
          status?: string
          updated_at?: string
          vehicle?: string | null
        }
        Update: {
          area_name?: string
          created_at?: string
          expected_joining_date?: string | null
          experience_years?: number | null
          full_name?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          notes?: string | null
          partner_user_id?: string | null
          phone?: string
          preferred_cars_per_day?: number | null
          status?: string
          updated_at?: string
          vehicle?: string | null
        }
        Relationships: []
      }
      partner_notifications: {
        Row: {
          body: string | null
          category: string
          created_at: string
          id: string
          link: string | null
          metadata: Json
          partner_id: string
          pushed_at: string | null
          read_at: string | null
          title: string
          type: string
        }
        Insert: {
          body?: string | null
          category?: string
          created_at?: string
          id?: string
          link?: string | null
          metadata?: Json
          partner_id: string
          pushed_at?: string | null
          read_at?: string | null
          title: string
          type: string
        }
        Update: {
          body?: string | null
          category?: string
          created_at?: string
          id?: string
          link?: string | null
          metadata?: Json
          partner_id?: string
          pushed_at?: string | null
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
          {
            foreignKeyName: "partner_reliability_events_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_reliability_events_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "v_vehicle_audit"
            referencedColumns: ["service_id"]
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
          current_lat: number | null
          current_lng: number | null
          email: string | null
          first_assignment_completed: boolean
          full_name: string | null
          home_area: string | null
          home_lat: number | null
          home_lng: number | null
          home_zone_id: string | null
          id: string
          joined_on: string
          last_seen: string | null
          level: string
          lifetime_earnings: number
          manual_mode_by: string | null
          manual_mode_enabled: boolean
          manual_mode_since: string | null
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
          current_lat?: number | null
          current_lng?: number | null
          email?: string | null
          first_assignment_completed?: boolean
          full_name?: string | null
          home_area?: string | null
          home_lat?: number | null
          home_lng?: number | null
          home_zone_id?: string | null
          id: string
          joined_on?: string
          last_seen?: string | null
          level?: string
          lifetime_earnings?: number
          manual_mode_by?: string | null
          manual_mode_enabled?: boolean
          manual_mode_since?: string | null
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
          current_lat?: number | null
          current_lng?: number | null
          email?: string | null
          first_assignment_completed?: boolean
          full_name?: string | null
          home_area?: string | null
          home_lat?: number | null
          home_lng?: number | null
          home_zone_id?: string | null
          id?: string
          joined_on?: string
          last_seen?: string | null
          level?: string
          lifetime_earnings?: number
          manual_mode_by?: string | null
          manual_mode_enabled?: boolean
          manual_mode_since?: string | null
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
            foreignKeyName: "partners_home_zone_id_fkey"
            columns: ["home_zone_id"]
            isOneToOne: false
            referencedRelation: "coverage_zones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partners_referred_by_fkey"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_attempts: {
        Row: {
          attempt_no: number
          booking_id: string
          channel: string
          created_at: string
          error_code: string | null
          error_message: string | null
          id: string
          metadata: Json
          outcome: string
          provider: string
          provider_order_id: string | null
          provider_payment_id: string | null
          user_id: string
        }
        Insert: {
          attempt_no?: number
          booking_id: string
          channel: string
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          metadata?: Json
          outcome: string
          provider?: string
          provider_order_id?: string | null
          provider_payment_id?: string | null
          user_id: string
        }
        Update: {
          attempt_no?: number
          booking_id?: string
          channel?: string
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          metadata?: Json
          outcome?: string
          provider?: string
          provider_order_id?: string | null
          provider_payment_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_attempts_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_attempts_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_admin_notification_trace"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "payment_attempts_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_assignment_pipeline_trace"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "payment_attempts_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_offer_debug"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "payment_attempts_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_payment_pipeline_timeline"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "payment_attempts_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_pipeline_metrics"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "payment_attempts_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_vehicle_audit"
            referencedColumns: ["booking_id"]
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
            foreignKeyName: "payment_transactions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_admin_notification_trace"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "payment_transactions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_assignment_pipeline_trace"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "payment_transactions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_offer_debug"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "payment_transactions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_payment_pipeline_timeline"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "payment_transactions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_pipeline_metrics"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "payment_transactions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_vehicle_audit"
            referencedColumns: ["booking_id"]
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
            foreignKeyName: "payments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_admin_notification_trace"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "payments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_assignment_pipeline_trace"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "payments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_offer_debug"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "payments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_payment_pipeline_timeline"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "payments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_pipeline_metrics"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "payments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_vehicle_audit"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "payments_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "v_admin_notification_trace"
            referencedColumns: ["subscription_id"]
          },
          {
            foreignKeyName: "payments_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "v_assignment_pipeline_trace"
            referencedColumns: ["subscription_id"]
          },
          {
            foreignKeyName: "payments_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "v_payment_pipeline_timeline"
            referencedColumns: ["subscription_id"]
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
      pipeline_events: {
        Row: {
          actor: string | null
          assignment_id: string | null
          booking_id: string | null
          created_at: string
          duration_ms: number | null
          error_message: string | null
          id: string
          occurred_at: string
          partner_id: string | null
          payload: Json
          row_id: string | null
          sequence_no: number | null
          source: string
          stage: string
          status: string
          subscription_id: string | null
        }
        Insert: {
          actor?: string | null
          assignment_id?: string | null
          booking_id?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          occurred_at?: string
          partner_id?: string | null
          payload?: Json
          row_id?: string | null
          sequence_no?: number | null
          source: string
          stage: string
          status?: string
          subscription_id?: string | null
        }
        Update: {
          actor?: string | null
          assignment_id?: string | null
          booking_id?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          occurred_at?: string
          partner_id?: string | null
          payload?: Json
          row_id?: string | null
          sequence_no?: number | null
          source?: string
          stage?: string
          status?: string
          subscription_id?: string | null
        }
        Relationships: []
      }
      pipeline_state: {
        Row: {
          booking_id: string
          created_at: string
          current_stage: string
          divergence_detected: boolean
          divergence_reason: string | null
          last_compared_at: string | null
          legacy_snapshot: Json
          new_snapshot: Json
          reached_stages: string[]
          updated_at: string
        }
        Insert: {
          booking_id: string
          created_at?: string
          current_stage?: string
          divergence_detected?: boolean
          divergence_reason?: string | null
          last_compared_at?: string | null
          legacy_snapshot?: Json
          new_snapshot?: Json
          reached_stages?: string[]
          updated_at?: string
        }
        Update: {
          booking_id?: string
          created_at?: string
          current_stage?: string
          divergence_detected?: boolean
          divergence_reason?: string | null
          last_compared_at?: string | null
          legacy_snapshot?: Json
          new_snapshot?: Json
          reached_stages?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      plan_inclusions: {
        Row: {
          created_at: string
          description: string | null
          display_order: number
          icon: string | null
          id: string
          is_active: boolean
          plan_slug: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_order?: number
          icon?: string | null
          id?: string
          is_active?: boolean
          plan_slug: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_order?: number
          icon?: string | null
          id?: string
          is_active?: boolean
          plan_slug?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
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
      push_action_tokens: {
        Row: {
          broadcast_id: string
          consumed_at: string | null
          created_at: string
          expires_at: string
          offer_id: string
          partner_id: string
          token: string
        }
        Insert: {
          broadcast_id: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          offer_id: string
          partner_id: string
          token: string
        }
        Update: {
          broadcast_id?: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          offer_id?: string
          partner_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_action_tokens_broadcast_id_fkey"
            columns: ["broadcast_id"]
            isOneToOne: false
            referencedRelation: "marketplace_broadcasts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_action_tokens_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "marketplace_offers"
            referencedColumns: ["id"]
          },
        ]
      }
      push_tokens: {
        Row: {
          app: string
          created_at: string
          device_id: string
          id: string
          invalid_at: string | null
          last_seen: string
          platform: string
          token: string
          user_id: string
        }
        Insert: {
          app?: string
          created_at?: string
          device_id?: string
          id?: string
          invalid_at?: string | null
          last_seen?: string
          platform?: string
          token: string
          user_id: string
        }
        Update: {
          app?: string
          created_at?: string
          device_id?: string
          id?: string
          invalid_at?: string | null
          last_seen?: string
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
      route_change_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_name: string | null
          created_at: string
          date: string
          id: string
          new_value: Json | null
          old_value: Json | null
          partner_id: string | null
          reason: string | null
          service_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_name?: string | null
          created_at?: string
          date?: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          partner_id?: string | null
          reason?: string | null
          service_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_name?: string | null
          created_at?: string
          date?: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          partner_id?: string | null
          reason?: string | null
          service_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "route_change_log_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "route_change_log_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "route_change_log_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "v_vehicle_audit"
            referencedColumns: ["service_id"]
          },
        ]
      }
      route_drafts: {
        Row: {
          created_at: string
          id: string
          partner_id: string
          payload: Json
          service_date: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          partner_id: string
          payload?: Json
          service_date: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          partner_id?: string
          payload?: Json
          service_date?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "route_drafts_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      route_snapshots: {
        Row: {
          created_at: string
          created_by: string | null
          date: string
          id: string
          kind: string
          metrics: Json
          partner_id: string
          sequence: Json
          status: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          date: string
          id?: string
          kind: string
          metrics?: Json
          partner_id: string
          sequence: Json
          status?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          date?: string
          id?: string
          kind?: string
          metrics?: Json
          partner_id?: string
          sequence?: Json
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "route_snapshots_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
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
          payment_mode: string
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
          payment_mode?: string
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
          payment_mode?: string
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
          {
            foreignKeyName: "service_analytics_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: true
            referencedRelation: "v_vehicle_audit"
            referencedColumns: ["service_id"]
          },
        ]
      }
      service_areas: {
        Row: {
          center_lat: number | null
          center_lng: number | null
          city: string
          created_at: string
          cutter_polish_enabled: boolean
          daily_shine_enabled: boolean
          deep_clean_enabled: boolean
          exterior_enabled: boolean
          id: string
          interior_enabled: boolean
          is_active: boolean
          launch_date: string | null
          name: string
          notes: string | null
          pincodes: string[]
          polish_enabled: boolean
          polygon: Json | null
          premium_enabled: boolean
          radius_km: number
          roof_cleaning_enabled: boolean
          seat_cleaning_enabled: boolean
          state: string
          updated_at: string
          washing_enabled: boolean
        }
        Insert: {
          center_lat?: number | null
          center_lng?: number | null
          city?: string
          created_at?: string
          cutter_polish_enabled?: boolean
          daily_shine_enabled?: boolean
          deep_clean_enabled?: boolean
          exterior_enabled?: boolean
          id?: string
          interior_enabled?: boolean
          is_active?: boolean
          launch_date?: string | null
          name: string
          notes?: string | null
          pincodes?: string[]
          polish_enabled?: boolean
          polygon?: Json | null
          premium_enabled?: boolean
          radius_km?: number
          roof_cleaning_enabled?: boolean
          seat_cleaning_enabled?: boolean
          state?: string
          updated_at?: string
          washing_enabled?: boolean
        }
        Update: {
          center_lat?: number | null
          center_lng?: number | null
          city?: string
          created_at?: string
          cutter_polish_enabled?: boolean
          daily_shine_enabled?: boolean
          deep_clean_enabled?: boolean
          exterior_enabled?: boolean
          id?: string
          interior_enabled?: boolean
          is_active?: boolean
          launch_date?: string | null
          name?: string
          notes?: string | null
          pincodes?: string[]
          polish_enabled?: boolean
          polygon?: Json | null
          premium_enabled?: boolean
          radius_km?: number
          roof_cleaning_enabled?: boolean
          seat_cleaning_enabled?: boolean
          state?: string
          updated_at?: string
          washing_enabled?: boolean
        }
        Relationships: []
      }
      service_catalog: {
        Row: {
          active: boolean
          addons: Json
          banner_url: string | null
          benefits: string[] | null
          category: string
          created_at: string
          description: string | null
          duration_minutes: number | null
          id: string
          includes_hatchback: string[]
          includes_sedan_suv: string[]
          name: string
          payment_mode: string
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
          category?: string
          created_at?: string
          description?: string | null
          duration_minutes?: number | null
          id?: string
          includes_hatchback?: string[]
          includes_sedan_suv?: string[]
          name: string
          payment_mode?: string
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
          category?: string
          created_at?: string
          description?: string | null
          duration_minutes?: number | null
          id?: string
          includes_hatchback?: string[]
          includes_sedan_suv?: string[]
          name?: string
          payment_mode?: string
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
      service_leads: {
        Row: {
          address_id: string | null
          address_text: string | null
          assigned_at: string | null
          assigned_detailer_id: string | null
          assigned_detailer_name: string | null
          booking_id: string | null
          cancel_reason: string | null
          cancelled_at: string | null
          completed_at: string | null
          created_at: string
          customer_name: string | null
          customer_phone: string | null
          id: string
          metadata: Json
          notes: string | null
          payment_id: string | null
          payment_status: string | null
          photos: string[]
          price: number
          scheduled_date: string | null
          scheduled_time: string | null
          service_category: string
          service_id: string | null
          service_name: string | null
          service_slug: string | null
          status: string
          updated_at: string
          user_id: string
          vehicle_id: string | null
          vehicle_label: string | null
        }
        Insert: {
          address_id?: string | null
          address_text?: string | null
          assigned_at?: string | null
          assigned_detailer_id?: string | null
          assigned_detailer_name?: string | null
          booking_id?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          created_at?: string
          customer_name?: string | null
          customer_phone?: string | null
          id?: string
          metadata?: Json
          notes?: string | null
          payment_id?: string | null
          payment_status?: string | null
          photos?: string[]
          price?: number
          scheduled_date?: string | null
          scheduled_time?: string | null
          service_category?: string
          service_id?: string | null
          service_name?: string | null
          service_slug?: string | null
          status?: string
          updated_at?: string
          user_id: string
          vehicle_id?: string | null
          vehicle_label?: string | null
        }
        Update: {
          address_id?: string | null
          address_text?: string | null
          assigned_at?: string | null
          assigned_detailer_id?: string | null
          assigned_detailer_name?: string | null
          booking_id?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          created_at?: string
          customer_name?: string | null
          customer_phone?: string | null
          id?: string
          metadata?: Json
          notes?: string | null
          payment_id?: string | null
          payment_status?: string | null
          photos?: string[]
          price?: number
          scheduled_date?: string | null
          scheduled_time?: string | null
          service_category?: string
          service_id?: string | null
          service_name?: string | null
          service_slug?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          vehicle_id?: string | null
          vehicle_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_leads_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_leads_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_admin_notification_trace"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "service_leads_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_assignment_pipeline_trace"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "service_leads_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_offer_debug"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "service_leads_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_payment_pipeline_timeline"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "service_leads_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_pipeline_metrics"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "service_leads_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_vehicle_audit"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "service_leads_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "service_catalog"
            referencedColumns: ["id"]
          },
        ]
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
          {
            foreignKeyName: "service_photos_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "v_vehicle_audit"
            referencedColumns: ["service_id"]
          },
        ]
      }
      services: {
        Row: {
          assignment_id: string | null
          cluster_id: string | null
          complete_lat: number | null
          complete_lng: number | null
          completed_at: string | null
          created_at: string
          customer_id: string
          delay_reason: string | null
          destination_lat: number | null
          destination_lng: number | null
          destination_source: string | null
          distance_km: number | null
          eta_at: string | null
          fraud_review: boolean
          gps_distance_m: number | null
          gps_flag: string | null
          id: string
          is_emergency: boolean
          last_sequence_change_at: string | null
          last_sequence_change_by: string | null
          locked_position: boolean
          manual_sequence_no: number | null
          original_partner_id: string | null
          partner_id: string | null
          priority: string
          priority_set_at: string | null
          priority_set_by: string | null
          rate_per_car: number
          reassigned_from: string | null
          recovery_event_id: string | null
          scheduled_date: string
          sequence_no: number | null
          start_lat: number | null
          start_lng: number | null
          started_at: string | null
          status: Database["public"]["Enums"]["service_status"]
          time_slot: string
          travel_min: number | null
          unavailable_at: string | null
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
          cluster_id?: string | null
          complete_lat?: number | null
          complete_lng?: number | null
          completed_at?: string | null
          created_at?: string
          customer_id: string
          delay_reason?: string | null
          destination_lat?: number | null
          destination_lng?: number | null
          destination_source?: string | null
          distance_km?: number | null
          eta_at?: string | null
          fraud_review?: boolean
          gps_distance_m?: number | null
          gps_flag?: string | null
          id?: string
          is_emergency?: boolean
          last_sequence_change_at?: string | null
          last_sequence_change_by?: string | null
          locked_position?: boolean
          manual_sequence_no?: number | null
          original_partner_id?: string | null
          partner_id?: string | null
          priority?: string
          priority_set_at?: string | null
          priority_set_by?: string | null
          rate_per_car?: number
          reassigned_from?: string | null
          recovery_event_id?: string | null
          scheduled_date?: string
          sequence_no?: number | null
          start_lat?: number | null
          start_lng?: number | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["service_status"]
          time_slot?: string
          travel_min?: number | null
          unavailable_at?: string | null
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
          cluster_id?: string | null
          complete_lat?: number | null
          complete_lng?: number | null
          completed_at?: string | null
          created_at?: string
          customer_id?: string
          delay_reason?: string | null
          destination_lat?: number | null
          destination_lng?: number | null
          destination_source?: string | null
          distance_km?: number | null
          eta_at?: string | null
          fraud_review?: boolean
          gps_distance_m?: number | null
          gps_flag?: string | null
          id?: string
          is_emergency?: boolean
          last_sequence_change_at?: string | null
          last_sequence_change_by?: string | null
          locked_position?: boolean
          manual_sequence_no?: number | null
          original_partner_id?: string | null
          partner_id?: string | null
          priority?: string
          priority_set_at?: string | null
          priority_set_by?: string | null
          rate_per_car?: number
          reassigned_from?: string | null
          recovery_event_id?: string | null
          scheduled_date?: string
          sequence_no?: number | null
          start_lat?: number | null
          start_lng?: number | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["service_status"]
          time_slot?: string
          travel_min?: number | null
          unavailable_at?: string | null
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
            foreignKeyName: "services_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "v_assignment_pipeline_trace"
            referencedColumns: ["assignment_id"]
          },
          {
            foreignKeyName: "services_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_original_partner_id_fkey"
            columns: ["original_partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
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
            foreignKeyName: "services_reassigned_from_fkey"
            columns: ["reassigned_from"]
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
      staff_login_otps: {
        Row: {
          attempts: number
          code_hash: string
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          phone: string
          role: string
        }
        Insert: {
          attempts?: number
          code_hash: string
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          phone: string
          role: string
        }
        Update: {
          attempts?: number
          code_hash?: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          phone?: string
          role?: string
        }
        Relationships: []
      }
      subscription_addon_requests: {
        Row: {
          assigned_detailer_id: string | null
          assigned_detailer_name: string | null
          cancelled_at: string | null
          completed_at: string | null
          created_at: string
          customer_name: string | null
          customer_phone: string | null
          id: string
          metadata: Json
          notes: string | null
          preferred_date: string | null
          preferred_time: string | null
          scheduled_at: string | null
          service_id: string | null
          service_name: string | null
          service_slug: string | null
          status: string
          subscription_id: string | null
          updated_at: string
          user_id: string
          vehicle_id: string | null
          vehicle_label: string | null
        }
        Insert: {
          assigned_detailer_id?: string | null
          assigned_detailer_name?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          created_at?: string
          customer_name?: string | null
          customer_phone?: string | null
          id?: string
          metadata?: Json
          notes?: string | null
          preferred_date?: string | null
          preferred_time?: string | null
          scheduled_at?: string | null
          service_id?: string | null
          service_name?: string | null
          service_slug?: string | null
          status?: string
          subscription_id?: string | null
          updated_at?: string
          user_id: string
          vehicle_id?: string | null
          vehicle_label?: string | null
        }
        Update: {
          assigned_detailer_id?: string | null
          assigned_detailer_name?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          created_at?: string
          customer_name?: string | null
          customer_phone?: string | null
          id?: string
          metadata?: Json
          notes?: string | null
          preferred_date?: string | null
          preferred_time?: string | null
          scheduled_at?: string | null
          service_id?: string | null
          service_name?: string | null
          service_slug?: string | null
          status?: string
          subscription_id?: string | null
          updated_at?: string
          user_id?: string
          vehicle_id?: string | null
          vehicle_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscription_addon_requests_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "service_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_addon_requests_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_addon_requests_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "v_admin_notification_trace"
            referencedColumns: ["subscription_id"]
          },
          {
            foreignKeyName: "subscription_addon_requests_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "v_assignment_pipeline_trace"
            referencedColumns: ["subscription_id"]
          },
          {
            foreignKeyName: "subscription_addon_requests_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "v_payment_pipeline_timeline"
            referencedColumns: ["subscription_id"]
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
          next_retry_at: string | null
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
          next_retry_at?: string | null
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
          next_retry_at?: string | null
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
            foreignKeyName: "subscription_assignment_queue_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "v_admin_notification_trace"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "subscription_assignment_queue_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "v_assignment_pipeline_trace"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "subscription_assignment_queue_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "v_offer_debug"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "subscription_assignment_queue_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "v_payment_pipeline_timeline"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "subscription_assignment_queue_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "v_pipeline_metrics"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "subscription_assignment_queue_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "v_vehicle_audit"
            referencedColumns: ["booking_id"]
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
      subscription_block_log: {
        Row: {
          created_at: string
          existing_subscription_id: string | null
          id: string
          meta: Json
          reason: string
          service_id: string | null
          source: string
          user_id: string | null
          vehicle_id: string | null
        }
        Insert: {
          created_at?: string
          existing_subscription_id?: string | null
          id?: string
          meta?: Json
          reason?: string
          service_id?: string | null
          source: string
          user_id?: string | null
          vehicle_id?: string | null
        }
        Update: {
          created_at?: string
          existing_subscription_id?: string | null
          id?: string
          meta?: Json
          reason?: string
          service_id?: string | null
          source?: string
          user_id?: string | null
          vehicle_id?: string | null
        }
        Relationships: []
      }
      subscription_entitlements: {
        Row: {
          benefit_type: Database["public"]["Enums"]["benefit_type"]
          consumed: number
          created_at: string
          cycle_end: string
          cycle_start: string
          id: string
          plan_slug: string
          subscription_id: string
          total_allocated: number | null
          updated_at: string
          user_id: string
          vehicle_id: string
        }
        Insert: {
          benefit_type: Database["public"]["Enums"]["benefit_type"]
          consumed?: number
          created_at?: string
          cycle_end: string
          cycle_start: string
          id?: string
          plan_slug: string
          subscription_id: string
          total_allocated?: number | null
          updated_at?: string
          user_id: string
          vehicle_id: string
        }
        Update: {
          benefit_type?: Database["public"]["Enums"]["benefit_type"]
          consumed?: number
          created_at?: string
          cycle_end?: string
          cycle_start?: string
          id?: string
          plan_slug?: string
          subscription_id?: string
          total_allocated?: number | null
          updated_at?: string
          user_id?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_entitlements_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_entitlements_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "v_admin_notification_trace"
            referencedColumns: ["subscription_id"]
          },
          {
            foreignKeyName: "subscription_entitlements_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "v_assignment_pipeline_trace"
            referencedColumns: ["subscription_id"]
          },
          {
            foreignKeyName: "subscription_entitlements_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "v_payment_pipeline_timeline"
            referencedColumns: ["subscription_id"]
          },
          {
            foreignKeyName: "subscription_entitlements_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "customer_vehicles"
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
      subscription_monthly_addons: {
        Row: {
          activated_at: string | null
          added_at: string
          addon_type: string
          booking_id: string | null
          created_at: string
          id: string
          is_active: boolean
          monthly_price: number
          payment_status: string
          quantity: number
          removed_at: string | null
          subscription_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          activated_at?: string | null
          added_at?: string
          addon_type: string
          booking_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          monthly_price?: number
          payment_status?: string
          quantity?: number
          removed_at?: string | null
          subscription_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          activated_at?: string | null
          added_at?: string
          addon_type?: string
          booking_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          monthly_price?: number
          payment_status?: string
          quantity?: number
          removed_at?: string | null
          subscription_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_monthly_addons_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_monthly_addons_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_admin_notification_trace"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "subscription_monthly_addons_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_assignment_pipeline_trace"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "subscription_monthly_addons_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_offer_debug"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "subscription_monthly_addons_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_payment_pipeline_timeline"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "subscription_monthly_addons_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_pipeline_metrics"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "subscription_monthly_addons_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_vehicle_audit"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "subscription_monthly_addons_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_monthly_addons_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "v_admin_notification_trace"
            referencedColumns: ["subscription_id"]
          },
          {
            foreignKeyName: "subscription_monthly_addons_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "v_assignment_pipeline_trace"
            referencedColumns: ["subscription_id"]
          },
          {
            foreignKeyName: "subscription_monthly_addons_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "v_payment_pipeline_timeline"
            referencedColumns: ["subscription_id"]
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
          {
            foreignKeyName: "subscription_offers_queue_id_fkey"
            columns: ["queue_id"]
            isOneToOne: false
            referencedRelation: "v_assignment_pipeline_trace"
            referencedColumns: ["queue_id"]
          },
          {
            foreignKeyName: "subscription_offers_queue_id_fkey"
            columns: ["queue_id"]
            isOneToOne: false
            referencedRelation: "v_offer_debug"
            referencedColumns: ["queue_id"]
          },
          {
            foreignKeyName: "subscription_offers_queue_id_fkey"
            columns: ["queue_id"]
            isOneToOne: false
            referencedRelation: "v_payment_pipeline_timeline"
            referencedColumns: ["queue_id"]
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
          {
            foreignKeyName: "subscription_pauses_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_admin_notification_trace"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "subscription_pauses_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_assignment_pipeline_trace"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "subscription_pauses_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_offer_debug"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "subscription_pauses_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_payment_pipeline_timeline"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "subscription_pauses_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_pipeline_metrics"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "subscription_pauses_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_vehicle_audit"
            referencedColumns: ["booking_id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          amount: number
          assigned_at: string | null
          assigned_partner_id: string | null
          booking_id: string
          cancel_at_period_end: boolean
          cancelled_at: string | null
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
          cancel_at_period_end?: boolean
          cancelled_at?: string | null
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
          cancel_at_period_end?: boolean
          cancelled_at?: string | null
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
          {
            foreignKeyName: "subscriptions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "v_admin_notification_trace"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "subscriptions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "v_assignment_pipeline_trace"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "subscriptions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "v_offer_debug"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "subscriptions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "v_payment_pipeline_timeline"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "subscriptions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "v_pipeline_metrics"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "subscriptions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "v_vehicle_audit"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "subscriptions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
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
            foreignKeyName: "unavailability_penalties_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "v_assignment_pipeline_trace"
            referencedColumns: ["assignment_id"]
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
          photos: string[]
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
          photos?: string[]
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
          photos?: string[]
          reason?: string
          service_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "unavailability_reports_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unavailability_reports_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unavailability_reports_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unavailability_reports_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "v_vehicle_audit"
            referencedColumns: ["service_id"]
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
          aliases: string[]
          body_type: string | null
          category: string
          colors: string[]
          created_at: string
          id: string
          image_url: string | null
          make: string
          model: string
          popularity: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          aliases?: string[]
          body_type?: string | null
          category: string
          colors?: string[]
          created_at?: string
          id?: string
          image_url?: string | null
          make: string
          model: string
          popularity?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          aliases?: string[]
          body_type?: string | null
          category?: string
          colors?: string[]
          created_at?: string
          id?: string
          image_url?: string | null
          make?: string
          model?: string
          popularity?: number
          updated_at?: string
        }
        Relationships: []
      }
      vehicle_trace_log: {
        Row: {
          actor_user_id: string | null
          addon_request_id: string | null
          booking_id: string | null
          created_at: string
          customer_id: string | null
          id: string
          payload: Json
          service_id: string | null
          source: string
          vehicle_id: string | null
        }
        Insert: {
          actor_user_id?: string | null
          addon_request_id?: string | null
          booking_id?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          payload?: Json
          service_id?: string | null
          source: string
          vehicle_id?: string | null
        }
        Update: {
          actor_user_id?: string | null
          addon_request_id?: string | null
          booking_id?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          payload?: Json
          service_id?: string | null
          source?: string
          vehicle_id?: string | null
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
            foreignKeyName: "wallet_ledger_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "v_assignment_pipeline_trace"
            referencedColumns: ["assignment_id"]
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
          {
            foreignKeyName: "wallet_ledger_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "v_vehicle_audit"
            referencedColumns: ["service_id"]
          },
        ]
      }
    }
    Views: {
      admin_gps_health: {
        Row: {
          active_customers: number | null
          as_of: string | null
          customers_waiting_reassignment: number | null
          duplicate_gps: number | null
          fixed_automatically: number | null
          gps_centroid: number | null
          gps_exact: number | null
          gps_invalid: number | null
          gps_issues_today: number | null
          gps_missing: number | null
          manual_corrections: number | null
          partners_offline: number | null
          partners_online: number | null
          partners_stale_heartbeat: number | null
          pending: number | null
        }
        Relationships: []
      }
      marketplace_delivery_stats: {
        Row: {
          accepted: number | null
          broadcast_id: string | null
          declined: number | null
          expired: number | null
          first_event_at: string | null
          last_event_at: string | null
          opened: number | null
          pushes_delivered: number | null
          pushes_failed: number | null
          pushes_sent: number | null
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_delivery_events_broadcast_id_fkey"
            columns: ["broadcast_id"]
            isOneToOne: false
            referencedRelation: "marketplace_broadcasts"
            referencedColumns: ["id"]
          },
        ]
      }
      mp_health: {
        Row: {
          assigned_30d: number | null
          cancelled_30d: number | null
          expired_30d: number | null
          live_broadcasts: number | null
          longest_wait_broadcast_id: string | null
          longest_wait_seconds: number | null
          waiting_round1: number | null
        }
        Relationships: []
      }
      v_admin_notification_trace: {
        Row: {
          booking_id: string | null
          booking_status: string | null
          category: string | null
          notification_id: string | null
          notified_at: string | null
          payment_status: string | null
          subject_id: string | null
          subject_type: string | null
          subscription_id: string | null
          subscription_status: string | null
          title: string | null
          verdict: string | null
        }
        Relationships: []
      }
      v_assignment_pipeline_trace: {
        Row: {
          assigned_partner_id: string | null
          assignment_id: string | null
          assignment_status: string | null
          booking_created_at: string | null
          booking_id: string | null
          booking_status: string | null
          current_offer_partner_id: string | null
          first_delivery_at: string | null
          last_offered_at: string | null
          offer_expires_at: string | null
          offers_accepted: number | null
          offers_declined: number | null
          offers_expired: number | null
          offers_pending: number | null
          offers_total: number | null
          payment_status: string | null
          payment_verified_at: string | null
          pipeline_verdict: string | null
          queue_id: string | null
          queue_status: string | null
          radius_km: number | null
          stages_seen: string[] | null
          subscription_id: string | null
          subscription_status: string | null
          tried_partner_ids: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "subscription_assignment_queue_current_offer_partner_id_fkey"
            columns: ["current_offer_partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_assigned_partner_id_fkey"
            columns: ["assigned_partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
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
      v_offer_debug: {
        Row: {
          attempts_log: Json | null
          booking_created_at: string | null
          booking_id: string | null
          booking_status: string | null
          caller: string | null
          created_by: string | null
          current_offer_partner_id: string | null
          expires_at: string | null
          next_retry_at: string | null
          offer_created_at: string | null
          offer_delivery_event_id: string | null
          offer_id: string | null
          offer_status: string | null
          offered_at: string | null
          partner_id: string | null
          partner_notification_at: string | null
          partner_notification_id: string | null
          partner_notification_pushed_at: string | null
          payment_status: string | null
          queue_created_at: string | null
          queue_id: string | null
          queue_status: string | null
          remaining_seconds_server: number | null
          responded_at: string | null
          retry_count: number | null
          rpc: string | null
          server_txid: string | null
          transition_at: string | null
          transition_meta: Json | null
          transition_stage: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscription_assignment_queue_current_offer_partner_id_fkey"
            columns: ["current_offer_partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_offers_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      v_payment_pipeline_timeline: {
        Row: {
          booking_id: string | null
          booking_status: string | null
          first_offer_id: string | null
          first_offer_partner_id: string | null
          first_offer_response: string | null
          integrity_status: string | null
          payment_status: string | null
          queue_id: string | null
          queue_status: string | null
          subscription_id: string | null
          subscription_status: string | null
          t_offer_created: string | null
          t_offer_responded: string | null
          t_partner_notified: string | null
          t_payment_started: string | null
          t_payment_verified: string | null
          t_queue_created: string | null
          t_subscription_activated: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscription_offers_partner_id_fkey"
            columns: ["first_offer_partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      v_pipeline_comparison: {
        Row: {
          any_error: boolean | null
          booking_id: string | null
          delta_ms: number | null
          legacy_actor: string | null
          legacy_at: string | null
          legacy_ms: number | null
          legacy_row_id: string | null
          new_actor: string | null
          new_at: string | null
          new_ms: number | null
          new_row_id: string | null
          stage: string | null
          status: string | null
        }
        Relationships: []
      }
      v_pipeline_metrics: {
        Row: {
          booking_id: string | null
          booking_status: string | null
          created_at: string | null
          divergence_detected: boolean | null
          divergence_reason: string | null
          error_message: string | null
          failure_source: string | null
          failure_stage: string | null
          legacy_events: number | null
          legacy_slowest_ms: number | null
          legacy_slowest_stage: string | null
          legacy_total_ms: number | null
          new_events: number | null
          new_slowest_ms: number | null
          new_slowest_stage: string | null
          new_total_ms: number | null
          payment_status: string | null
        }
        Relationships: []
      }
      v_pipeline_validation_scorecard: {
        Row: {
          bookings_observed: number | null
          diverged: number | null
          fully_matched: number | null
          legacy_only: number | null
          match_rate_pct: number | null
          new_only: number | null
        }
        Relationships: []
      }
      v_vehicle_audit: {
        Row: {
          booking_id: string | null
          booking_make: string | null
          booking_model: string | null
          booking_reg: string | null
          booking_vehicle_id: string | null
          created_at: string | null
          customer_id: string | null
          customer_name: string | null
          mismatch: boolean | null
          scheduled_date: string | null
          service_id: string | null
          service_make: string | null
          service_model: string | null
          service_reg: string | null
          service_vehicle_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_vehicle_id_fkey"
            columns: ["booking_vehicle_id"]
            isOneToOne: false
            referencedRelation: "customer_vehicles"
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
            foreignKeyName: "services_vehicle_id_fkey"
            columns: ["service_vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _booking_for_service: {
        Args: { p_service_id: string }
        Returns: {
          preferred_before_time: string
          scheduled_date: string
          user_id: string
        }[]
      }
      _customer_window_cutoff: {
        Args: { p_date: string; p_text: string }
        Returns: string
      }
      _haversine_km: {
        Args: { lat1: number; lat2: number; lng1: number; lng2: number }
        Returns: number
      }
      _resolve_user_id_for_customer: {
        Args: { p_customer_id: string }
        Returns: string
      }
      _setting_bool: {
        Args: { _default: boolean; _key: string }
        Returns: boolean
      }
      _setting_num: {
        Args: { _default: number; _key: string }
        Returns: number
      }
      accept_assignment: { Args: { p_target_cars: number }; Returns: string }
      accept_assignment_v2: {
        Args: { p_cars: number; p_duration: number }
        Returns: string
      }
      acquire_checkout_hold: {
        Args: {
          p_booking_id: string
          p_holder_id: string
          p_reason?: string
          p_ttl_seconds?: number
        }
        Returns: Json
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
      addon_price_for_benefit: {
        Args: {
          p_benefit: Database["public"]["Enums"]["benefit_type"]
          p_vehicle_category: string
        }
        Returns: number
      }
      admin_accept_recalc: {
        Args: { _snapshot_id: string }
        Returns: undefined
      }
      admin_assign_lead: {
        Args: {
          p_detailer_id: string
          p_detailer_name: string
          p_lead_id: string
        }
        Returns: undefined
      }
      admin_cancel_assignment: {
        Args: { p_assignment_id: string; p_note?: string }
        Returns: undefined
      }
      admin_cancel_lead: {
        Args: { p_lead_id: string; p_reason: string }
        Returns: undefined
      }
      admin_cancel_queue: {
        Args: { p_queue_id: string; p_reason?: string }
        Returns: Json
      }
      admin_complete_lead: { Args: { p_lead_id: string }; Returns: undefined }
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
      admin_force_complete_service: {
        Args: { p_reason: string; p_service_id: string }
        Returns: Json
      }
      admin_force_recalculate: {
        Args: { p_date: string; p_partner_id: string }
        Returns: undefined
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
      admin_lock_service: {
        Args: { p_locked: boolean; p_service_id: string }
        Returns: undefined
      }
      admin_log_route_action: {
        Args: {
          _action: string
          _date: string
          _new: Json
          _old: Json
          _partner_id: string
          _reason: string
          _service_id: string
        }
        Returns: string
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
      admin_optimize_all: { Args: { _date: string }; Returns: Json }
      admin_reassign_service: {
        Args: { p_new_partner_id: string; p_service_id: string }
        Returns: undefined
      }
      admin_reject_recalc: {
        Args: { _snapshot_id: string }
        Returns: undefined
      }
      admin_remove_service: {
        Args: { _reason: string; _service_id: string }
        Returns: undefined
      }
      admin_reorder_services: {
        Args: { p_date: string; p_ordered_ids: string[]; p_partner_id: string }
        Returns: undefined
      }
      admin_resolve_alert: { Args: { p_alert: string }; Returns: undefined }
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
      admin_route_dashboard: {
        Args: { _date: string; _partner_id: string }
        Returns: Json
      }
      admin_route_draft_discard: {
        Args: { p_date: string; p_partner_id: string }
        Returns: undefined
      }
      admin_route_draft_get: {
        Args: { p_date: string; p_partner_id: string }
        Returns: Json
      }
      admin_route_draft_save: {
        Args: {
          p_date: string
          p_items: Json
          p_partner_id: string
          p_reason?: string
        }
        Returns: Json
      }
      admin_route_draft_set: {
        Args: {
          p_date: string
          p_partner_id: string
          p_payload: Json
          p_reason?: string
        }
        Returns: undefined
      }
      admin_route_history: {
        Args: { p_date: string; p_partner_id: string }
        Returns: {
          actor: string
          created_at: string
          kind: string
          metrics: Json
          reason: string
          snapshot_id: string
          status: string
          version: number
        }[]
      }
      admin_route_reassign: {
        Args: {
          p_position?: number
          p_reason?: string
          p_service_id: string
          p_to_partner: string
        }
        Returns: Json
      }
      admin_route_remove_stop: {
        Args: { p_mode: string; p_reason?: string; p_service_id: string }
        Returns: Json
      }
      admin_route_restore_snapshot: {
        Args: { p_reason?: string; p_snapshot_id: string }
        Returns: undefined
      }
      admin_route_resume_ai: {
        Args: { p_partner_id: string }
        Returns: undefined
      }
      admin_route_search_customers: {
        Args: { p_date: string; p_query: string }
        Returns: {
          address_line: string
          area: string
          current_partner_id: string
          current_partner_name: string
          customer_id: string
          full_name: string
          has_active_subscription: boolean
          phone: string
          preferred_time: string
          service_id: string
          status: string
          vehicle_model: string
          vehicle_reg: string
        }[]
      }
      admin_route_timeline: {
        Args: { _date: string; _partner_id: string }
        Returns: Json
      }
      admin_set_customer_payment: {
        Args: { p_id: string; p_status: string }
        Returns: undefined
      }
      admin_set_vehicle_discount_approval: {
        Args: { p_approved: boolean; p_vehicle_id: string }
        Returns: boolean
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
      admin_update_lead: {
        Args: { p_lead_id: string; p_patch: Json }
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
      admin_zone_calendar_delete: { Args: { p_id: string }; Returns: undefined }
      admin_zone_calendar_upsert: {
        Args: {
          p_dow: number[]
          p_ds: boolean
          p_from: string
          p_id: string
          p_premium: boolean
          p_reason: string
          p_to: string
          p_zone: string
        }
        Returns: string
      }
      admin_zone_delete: { Args: { p_id: string }; Returns: undefined }
      admin_zone_duplicate: { Args: { p_id: string }; Returns: string }
      admin_zone_rollback: { Args: { p_history_id: string }; Returns: string }
      admin_zone_set_status: {
        Args: { p_id: string; p_status: string }
        Returns: undefined
      }
      admin_zone_upsert: { Args: { payload: Json }; Returns: string }
      assert_serviceable: {
        Args: { p_lat: number; p_lng: number; p_slug: string }
        Returns: string
      }
      auto_extend_company_failures: { Args: { p_date?: string }; Returns: Json }
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
      close_expired_assignments: { Args: never; Returns: number }
      compute_area_lock_until: { Args: { _partner: string }; Returns: string }
      compute_coverage_alerts: { Args: never; Returns: number }
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
      create_addon_request: {
        Args: {
          p_address_id?: string
          p_notes: string
          p_preferred_date: string
          p_preferred_time: string
          p_service_id: string
          p_subscription_id: string
          p_vehicle_id?: string
        }
        Returns: Json
      }
      create_monthly_addon_checkout: {
        Args: { p_addon_type: string; p_subscription_id: string }
        Returns: string
      }
      customer_cancel_booking: {
        Args: { p_booking_id: string; p_reason?: string }
        Returns: undefined
      }
      customer_has_pro_booking_on: {
        Args: { p_customer_id: string; p_date: string }
        Returns: boolean
      }
      dar_accept_offer: {
        Args: { p_offer_id: string; p_service_ids?: string[] }
        Returns: Json
      }
      dar_check_offline_partners: { Args: never; Returns: number }
      dar_check_start_timeouts: { Args: never; Returns: number }
      dar_dashboard_metrics: { Args: never; Returns: Json }
      dar_expire_offers: { Args: never; Returns: number }
      dar_find_candidates: { Args: { p_event_id: string }; Returns: number }
      dar_ignore_offer: { Args: { p_offer_id: string }; Returns: undefined }
      dar_trigger_recovery: {
        Args: { p_partner_id: string; p_reason: string }
        Returns: string
      }
      ds_activate_paid_booking: {
        Args: { p_booking_id: string }
        Returns: undefined
      }
      ds_check_divergence: {
        Args: { p_booking_id: string; p_stage: string }
        Returns: boolean
      }
      ds_create_assignment: {
        Args: { p_booking_id: string; p_partner_id: string }
        Returns: undefined
      }
      ds_create_offer: {
        Args: { p_booking_id: string; p_partner_id: string }
        Returns: undefined
      }
      ds_enqueue_assignment: {
        Args: { p_booking_id: string }
        Returns: undefined
      }
      ds_generate_today_service: {
        Args: { p_booking_id: string }
        Returns: undefined
      }
      ds_log_event: {
        Args: {
          p_actor: string
          p_assignment_id?: string
          p_booking_id: string
          p_duration_ms?: number
          p_error?: string
          p_partner_id?: string
          p_payload?: Json
          p_row_id?: string
          p_source: string
          p_stage: string
          p_status?: string
          p_subscription_id?: string
        }
        Returns: string
      }
      ds_notify: {
        Args: {
          p_booking_id: string
          p_kind: string
          p_partner_id?: string
          p_payload?: Json
          p_recipient: string
          p_user_id?: string
        }
        Returns: string
      }
      ds_on_payment_verified: {
        Args: { p_booking_id: string }
        Returns: undefined
      }
      ds_partner_accept: {
        Args: { p_booking_id: string; p_partner_id: string }
        Returns: undefined
      }
      enqueue_subscription_booking: {
        Args: { p_booking_id: string }
        Returns: string
      }
      ensure_entitlements_for_subscription: {
        Args: { p_sub_id: string }
        Returns: undefined
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
      generate_daily_routes: { Args: { p_date?: string }; Returns: number }
      generate_services_for_queue: {
        Args: { p_queue_id: string }
        Returns: number
      }
      get_admin_user_ids: {
        Args: never
        Returns: {
          user_id: string
        }[]
      }
      get_area_availability: {
        Args: { p_lat?: number; p_lng?: number; p_pincode?: string }
        Returns: {
          area_id: string
          area_name: string
          cutter_polish: boolean
          daily_shine: boolean
          deep_clean: boolean
          distance_km: number
          exterior: boolean
          interior: boolean
          is_active: boolean
          matched: boolean
          polish: boolean
          premium: boolean
          roof_cleaning: boolean
          seat_cleaning: boolean
          washing: boolean
        }[]
      }
      get_assigned_partner_public: {
        Args: { p_partner_id: string }
        Returns: {
          created_at: string
          full_name: string
          home_area: string
          id: string
          partner_code: string
          profile_photo_url: string
          rating: number
        }[]
      }
      get_assignment_cancellability: {
        Args: { p_assignment_id: string }
        Returns: {
          can_cancel: boolean
          deadline_at: string
          reason: string
          route_started: boolean
          shift_start_at: string
          status: string
        }[]
      }
      get_coverage_at: {
        Args: { p_lat: number; p_lng: number }
        Returns: {
          corporate_fleet: boolean
          cutter_polish: boolean
          daily_shine: boolean
          deep_clean: boolean
          emergency: boolean
          exterior: boolean
          int_ext: boolean
          interior: boolean
          matched: boolean
          polish: boolean
          premium: boolean
          roof_cleaning: boolean
          seat_cleaning: boolean
          status: string
          washing: boolean
          zone_id: string
          zone_name: string
        }[]
      }
      get_my_service_photo_url: {
        Args: { p_expires?: number; p_storage_path: string }
        Returns: string
      }
      get_offer_details_by_id: { Args: { p_offer_id: string }; Returns: Json }
      get_partner_open_offers: {
        Args: { p_partner_id: string }
        Returns: {
          booking_id: string
          broadcast_id: string
          broadcast_status: string
          current_incentive: number
          current_radius_m: number
          current_round: number
          customer_lat: number
          customer_lng: number
          distance_from_route_m: number
          id: string
          incentive: number
          partner_id: string
          response: string
          round: number
          round_expires_at: string
          route_impact_m: number
          sent_at: string
          server_now: string
          subscription_id: string
          vehicle_id: string
        }[]
      }
      get_partner_ui_prefs: { Args: never; Returns: Json }
      get_pending_offer_for_partner: {
        Args: { p_partner_id: string }
        Returns: Json
      }
      get_route_visibility: {
        Args: { p_partner: string }
        Returns: {
          assignment_id: string
          override: string
          shift_start: string
          unlock_at: string
          visible: boolean
        }[]
      }
      get_vehicle_entitlements: {
        Args: { p_vehicle_id: string }
        Returns: {
          benefit_type: Database["public"]["Enums"]["benefit_type"]
          consumed: number
          cycle_end: string
          remaining: number
          subscription_id: string
          total_allocated: number
          unlimited: boolean
        }[]
      }
      get_zone_capacity: {
        Args: { p_date?: string; p_zone: string }
        Returns: {
          booked: number
          daily_capacity: number
          remaining: number
          used_pct: number
        }[]
      }
      get_zone_dashboard: {
        Args: never
        Returns: {
          active_customers: number
          active_partners: number
          available_partners: number
          avg_rating: number
          booked: number
          calendar_ds_on: boolean
          calendar_premium_on: boolean
          capacity_used_pct: number
          complaints_open: number
          daily_capacity: number
          daily_shine_enabled: boolean
          ds_customers: number
          leads_pending: number
          marketplace_queue: number
          premium_customers: number
          premium_enabled: boolean
          remaining: number
          renewals_today: number
          revenue_month: number
          revenue_today: number
          services_completed: number
          services_today: number
          status: string
          zone_id: string
          zone_name: string
        }[]
      }
      gps_audit_report: { Args: never; Returns: Json }
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
      haversine_m: {
        Args: { lat1: number; lat2: number; lng1: number; lng2: number }
        Returns: number
      }
      is_admin_or_ops: { Args: { _uid: string }; Returns: boolean }
      is_centroid_coord: {
        Args: { _lat: number; _lng: number }
        Returns: boolean
      }
      is_daily_shine_open: {
        Args: { p_date?: string; p_zone: string }
        Returns: boolean
      }
      is_exact_gps: { Args: { _lat: number; _lng: number }; Returns: boolean }
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
      list_my_recent_services:
        | {
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
        | {
            Args: { p_days?: number; p_vehicle_id?: string }
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
      list_my_service_history: {
        Args: { p_days?: number; p_vehicle_id?: string }
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
      log_offer_client_event: {
        Args: { p_meta?: Json; p_offer_id: string; p_stage: string }
        Returns: string
      }
      log_partner_apk_workflow_event: {
        Args: {
          p_accuracy?: number
          p_app_variant?: string
          p_assignment_id?: string
          p_event_type: string
          p_is_native?: boolean
          p_lat?: number
          p_lng?: number
          p_payload?: Json
          p_platform?: string
          p_service_id?: string
          p_status?: string
        }
        Returns: string
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
      log_vehicle_trace: {
        Args: {
          p_addon_request_id?: string
          p_booking_id?: string
          p_customer_id?: string
          p_payload?: Json
          p_service_id?: string
          p_source: string
          p_vehicle_id?: string
        }
        Returns: string
      }
      materialize_monthly_addons: { Args: never; Returns: number }
      modify_assignment: {
        Args: { p_assignment_id: string; p_delta: number }
        Returns: Json
      }
      mp_accept_offer: { Args: { p_broadcast_id: string }; Returns: Json }
      mp_accept_offer_legacy_impl: {
        Args: { p_broadcast_id: string }
        Returns: Json
      }
      mp_admin_cancel_broadcast: {
        Args: { p_broadcast_id: string; p_reason?: string }
        Returns: Json
      }
      mp_admin_extend_timer: {
        Args: { p_broadcast_id: string; p_seconds: number }
        Returns: Json
      }
      mp_admin_force_assign: {
        Args: { p_broadcast_id: string; p_partner_id: string }
        Returns: Json
      }
      mp_admin_rebroadcast: { Args: { p_broadcast_id: string }; Returns: Json }
      mp_admin_set_incentive: {
        Args: { p_broadcast_id: string; p_incentive: number }
        Returns: Json
      }
      mp_admin_set_radius: {
        Args: { p_broadcast_id: string; p_radius_m: number }
        Returns: Json
      }
      mp_advance_round: { Args: { p_broadcast_id: string }; Returns: Json }
      mp_consume_action_token: {
        Args: { p_action: string; p_token: string }
        Returns: Json
      }
      mp_consume_action_token_legacy_impl: {
        Args: { p_action: string; p_token: string }
        Returns: Json
      }
      mp_decline_offer: { Args: { p_broadcast_id: string }; Returns: Json }
      mp_eligible_partners: {
        Args: {
          p_broadcast_id: string
          p_include_neighbours?: boolean
          p_radius_m: number
        }
        Returns: {
          distance_m: number
          partner_id: string
          remaining_capacity: number
          today_cars: number
        }[]
      }
      mp_expire_stale_offers: { Args: never; Returns: undefined }
      mp_generate_services_for_broadcast: {
        Args: { p_broadcast_id: string }
        Returns: number
      }
      mp_haversine_m: {
        Args: { lat1: number; lat2: number; lng1: number; lng2: number }
        Returns: number
      }
      mp_mint_action_token: {
        Args: {
          p_broadcast_id: string
          p_offer_id: string
          p_partner_id: string
        }
        Returns: string
      }
      mp_open_broadcast: {
        Args: { p_subscription_id: string }
        Returns: string
      }
      mp_tick: { Args: never; Returns: number }
      offer_next_for_queue: { Args: { p_queue_id: string }; Returns: string }
      partner_complete_service: {
        Args: {
          p_force_override?: boolean
          p_lat?: number
          p_lng?: number
          p_notes?: string
          p_service_id: string
        }
        Returns: Json
      }
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
      plan_benefit_allocation: {
        Args: {
          p_benefit: Database["public"]["Enums"]["benefit_type"]
          p_plan: string
        }
        Returns: number
      }
      point_in_polygon: {
        Args: { p_lat: number; p_lng: number; p_poly: Json }
        Returns: boolean
      }
      point_in_zone: {
        Args: { p_lat: number; p_lng: number; p_zone_id: string }
        Returns: boolean
      }
      polygon_contains_point: {
        Args: { p_lat: number; p_lng: number; p_polygon: Json }
        Returns: boolean
      }
      preview_assignment: {
        Args: { p_cars: number; p_duration: number }
        Returns: {
          available_customers: number
          cars: number
          daily_earnings: number
          daily_shine_demand: number
          daily_shine_open: boolean
          duration_days: number
          estimated_hours: number
          estimated_radius_km: number
          expected_end_time: string
          expected_start_time: string
          message: string
          total_earnings: number
          working_days: number
          zone_capacity_remaining: number
          zone_id: string
          zone_name: string
          zone_used_pct: number
        }[]
      }
      preview_customer_booking: {
        Args: {
          p_addons?: Json
          p_address_id?: string
          p_coupon_code?: string
          p_scheduled_date?: string
          p_scheduled_time?: string
          p_service_id: string
          p_vehicle_id: string
        }
        Returns: Json
      }
      rank_expansion_requests: {
        Args: never
        Returns: {
          area: string
          ds_count: number
          nearest_distance_km: number
          nearest_zone: string
          potential_revenue: number
          premium_count: number
          requests: number
          suggested_priority: string
        }[]
      }
      reconcile_duplicate_subscriptions: {
        Args: never
        Returns: {
          open_count: number
          vehicle_id: string
        }[]
      }
      regenerate_assignment_services: {
        Args: { p_assignment_id: string; p_from_date?: string }
        Returns: number
      }
      release_checkout_hold: {
        Args: { p_booking_id: string; p_holder_id: string }
        Returns: Json
      }
      renew_assignments: { Args: never; Returns: number }
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
      send_partner_notification: {
        Args: {
          p_body?: string
          p_category: string
          p_link?: string
          p_metadata?: Json
          p_partner_id: string
          p_title: string
          p_type: string
        }
        Returns: string
      }
      service_slug_to_benefit: {
        Args: { p_slug: string }
        Returns: Database["public"]["Enums"]["benefit_type"]
      }
      set_partner_area: {
        Args: { p_area: string; p_lat: number; p_lng: number }
        Returns: undefined
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      simulate_zone_change: {
        Args: { p_patch: Json; p_zone: string }
        Returns: {
          delta_customers: number
          delta_houses: number
          delta_partners: number
          delta_requests: number
          est_monthly_revenue: number
        }[]
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
      submit_partner_expansion_request: {
        Args: {
          p_area_name: string
          p_expected_joining_date?: string
          p_experience_years?: number
          p_latitude: number
          p_longitude: number
          p_notes?: string
          p_preferred_cars_per_day?: number
          p_vehicle?: string
        }
        Returns: string
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
          p_photos: string[]
          p_reason: string
          p_service_id: string
        }
        Returns: Json
      }
      sweep_regenerate_active_assignments: { Args: never; Returns: number }
      sweep_subscription_offers: { Args: never; Returns: number }
      try_consume_entitlement: {
        Args: {
          p_addon_request_id?: string
          p_benefit: Database["public"]["Enums"]["benefit_type"]
          p_booking_id?: string
          p_reason?: string
          p_vehicle_id: string
        }
        Returns: Json
      }
      user_owns_service: {
        Args: { _service_id: string; _user: string }
        Returns: boolean
      }
      validate_today_assignment: { Args: { p_partner: string }; Returns: Json }
      working_days_end_date: {
        Args: { p_off_dow?: number; p_start: string; p_working: number }
        Returns: string
      }
      zone_calendar_mask: {
        Args: { p_date: string; p_zone: string }
        Returns: {
          daily_shine_on: boolean
          premium_on: boolean
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "supervisor" | "partner" | "customer" | "ops_manager"
      availability_status: "online" | "offline" | "leave" | "emergency_leave"
      benefit_type:
        | "interior"
        | "exterior_daily"
        | "exterior_hydrophobic"
        | "dusting"
        | "tyre_polish"
        | "paper_mats"
        | "fragrance"
      complaint_status: "open" | "investigating" | "resolved" | "dismissed"
      partner_status:
        | "pending_verification"
        | "active"
        | "suspended"
        | "offline"
      payout_status: "pending" | "processing" | "paid" | "failed"
      photo_angle: "front" | "rear" | "left" | "right"
      photo_stage: "before" | "after" | "unavailable" | "dirty"
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
        | "covered_by_booking"
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
        | "vehicle_taken_out"
        | "keys_not_available"
        | "security_guard_denied"
        | "other"
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
      app_role: ["admin", "supervisor", "partner", "customer", "ops_manager"],
      availability_status: ["online", "offline", "leave", "emergency_leave"],
      benefit_type: [
        "interior",
        "exterior_daily",
        "exterior_hydrophobic",
        "dusting",
        "tyre_polish",
        "paper_mats",
        "fragrance",
      ],
      complaint_status: ["open", "investigating", "resolved", "dismissed"],
      partner_status: [
        "pending_verification",
        "active",
        "suspended",
        "offline",
      ],
      payout_status: ["pending", "processing", "paid", "failed"],
      photo_angle: ["front", "rear", "left", "right"],
      photo_stage: ["before", "after", "unavailable", "dirty"],
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
        "covered_by_booking",
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
        "vehicle_taken_out",
        "keys_not_available",
        "security_guard_denied",
        "other",
      ],
    },
  },
} as const
