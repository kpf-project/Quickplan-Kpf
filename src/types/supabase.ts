export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      attendance_scan_events: {
        Row: {
          branch_snapshot: string | null
          check_in_snapshot: string | null
          check_out_snapshot: string | null
          client_scanned_at: string | null
          created_at: string
          department_snapshot: string | null
          device_id: string | null
          employee_code: string
          employee_code_key: string | null
          employee_name_snapshot: string | null
          event_type: string
          gateway_fetched_at: string | null
          id: string
          ip_address: unknown
          metadata: Json
          note: string | null
          operator_user_id: string | null
          operator_username_snapshot: string | null
          raw_qr_payload: string | null
          reject_reason: string | null
          request_id: string
          scan_business_date: string | null
          scanned_at: string
          source: string
          status: string
          user_agent: string | null
        }
        Insert: {
          branch_snapshot?: string | null
          check_in_snapshot?: string | null
          check_out_snapshot?: string | null
          client_scanned_at?: string | null
          created_at?: string
          department_snapshot?: string | null
          device_id?: string | null
          employee_code: string
          employee_code_key?: string | null
          employee_name_snapshot?: string | null
          event_type: string
          gateway_fetched_at?: string | null
          id?: string
          ip_address?: unknown
          metadata?: Json
          note?: string | null
          operator_user_id?: string | null
          operator_username_snapshot?: string | null
          raw_qr_payload?: string | null
          reject_reason?: string | null
          request_id: string
          scan_business_date?: string | null
          scanned_at?: string
          source?: string
          status?: string
          user_agent?: string | null
        }
        Update: {
          branch_snapshot?: string | null
          check_in_snapshot?: string | null
          check_out_snapshot?: string | null
          client_scanned_at?: string | null
          created_at?: string
          department_snapshot?: string | null
          device_id?: string | null
          employee_code?: string
          employee_code_key?: string | null
          employee_name_snapshot?: string | null
          event_type?: string
          gateway_fetched_at?: string | null
          id?: string
          ip_address?: unknown
          metadata?: Json
          note?: string | null
          operator_user_id?: string | null
          operator_username_snapshot?: string | null
          raw_qr_payload?: string | null
          reject_reason?: string | null
          request_id?: string
          scan_business_date?: string | null
          scanned_at?: string
          source?: string
          status?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          id: number
          metadata: Json
          target_id: string | null
          target_table: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          id?: number
          metadata?: Json
          target_id?: string | null
          target_table?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          id?: number
          metadata?: Json
          target_id?: string | null
          target_table?: string | null
        }
        Relationships: []
      }
      client_runtime_diagnostics: {
        Row: {
          created_at: string
          deployment_id: string | null
          device_id: string | null
          digest: string | null
          event_type: string
          id: number
          incident_id: string
          message: string
          metadata: Json
          occurred_at: string
          pathname: string | null
          severity: string
          stack: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          deployment_id?: string | null
          device_id?: string | null
          digest?: string | null
          event_type: string
          id?: number
          incident_id: string
          message: string
          metadata?: Json
          occurred_at: string
          pathname?: string | null
          severity?: string
          stack?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          deployment_id?: string | null
          device_id?: string | null
          digest?: string | null
          event_type?: string
          id?: number
          incident_id?: string
          message?: string
          metadata?: Json
          occurred_at?: string
          pathname?: string | null
          severity?: string
          stack?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      departments: {
        Row: {
          created_at: string
          external_code: string | null
          id: string
          is_active: boolean
          name: string
          source: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          external_code?: string | null
          id?: string
          is_active?: boolean
          name: string
          source?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          external_code?: string | null
          id?: string
          is_active?: boolean
          name?: string
          source?: string
          updated_at?: string
        }
        Relationships: []
      }
      pallet_qty_barcodes: {
        Row: {
          barcode_value: string
          created_at: string
          created_by: string | null
          display_qty: number
          id: string
          is_active: boolean
          label: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          barcode_value: string
          created_at?: string
          created_by?: string | null
          display_qty: number
          id?: string
          is_active?: boolean
          label?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          barcode_value?: string
          created_at?: string
          created_by?: string | null
          display_qty?: number
          id?: string
          is_active?: boolean
          label?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pallet_qty_barcodes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pallet_qty_barcodes_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pallet_qty_category_mappings: {
        Row: {
          created_at: string
          created_by: string | null
          iccat_code: string
          qty_barcode_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          iccat_code: string
          qty_barcode_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          iccat_code?: string
          qty_barcode_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pallet_qty_category_mappings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pallet_qty_category_mappings_qty_barcode_id_fkey"
            columns: ["qty_barcode_id"]
            isOneToOne: false
            referencedRelation: "pallet_qty_barcodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pallet_qty_category_mappings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pallet_qty_scan_logs: {
        Row: {
          actual_qty: number
          confirmed_default: boolean
          doc_no: string | null
          doc_round: number | null
          doc_seq: number | null
          doc_year_be: number | null
          goods_code_snapshot: string | null
          iccat_code_snapshot: string | null
          iccat_name_snapshot: string | null
          id: string
          machine_code: string | null
          metadata: Json
          product_barcode: string
          qty_barcode_value: string
          qty_display: number
          recorded_by: string | null
          recorded_by_username: string | null
          scanned_at: string
          sku_code: string
          sku_name_snapshot: string | null
          unit_snapshot: string | null
        }
        Insert: {
          actual_qty: number
          confirmed_default: boolean
          doc_no?: string | null
          doc_round?: number | null
          doc_seq?: number | null
          doc_year_be?: number | null
          goods_code_snapshot?: string | null
          iccat_code_snapshot?: string | null
          iccat_name_snapshot?: string | null
          id?: string
          machine_code?: string | null
          metadata?: Json
          product_barcode: string
          qty_barcode_value: string
          qty_display: number
          recorded_by?: string | null
          recorded_by_username?: string | null
          scanned_at?: string
          sku_code: string
          sku_name_snapshot?: string | null
          unit_snapshot?: string | null
        }
        Update: {
          actual_qty?: number
          confirmed_default?: boolean
          doc_no?: string | null
          doc_round?: number | null
          doc_seq?: number | null
          doc_year_be?: number | null
          goods_code_snapshot?: string | null
          iccat_code_snapshot?: string | null
          iccat_name_snapshot?: string | null
          id?: string
          machine_code?: string | null
          metadata?: Json
          product_barcode?: string
          qty_barcode_value?: string
          qty_display?: number
          recorded_by?: string | null
          recorded_by_username?: string | null
          scanned_at?: string
          sku_code?: string
          sku_name_snapshot?: string | null
          unit_snapshot?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pallet_qty_scan_logs_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pallet_qty_sku_mappings: {
        Row: {
          created_at: string
          created_by: string | null
          qty_barcode_id: string
          sku_code: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          qty_barcode_id: string
          sku_code: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          qty_barcode_id?: string
          sku_code?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pallet_qty_sku_mappings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pallet_qty_sku_mappings_qty_barcode_id_fkey"
            columns: ["qty_barcode_id"]
            isOneToOne: false
            referencedRelation: "pallet_qty_barcodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pallet_qty_sku_mappings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pallet_trade_code_barcodes: {
        Row: {
          created_at: string
          created_by: string | null
          goods_code: string
          product_barcode: string
          sku_code: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          goods_code: string
          product_barcode: string
          sku_code: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          goods_code?: string
          product_barcode?: string
          sku_code?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pallet_trade_code_barcodes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pallet_trade_code_barcodes_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          created_at: string
          group_key: string | null
          id: string
          label: string
          path: string
          perm_key: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          group_key?: string | null
          id?: string
          label: string
          path: string
          perm_key: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          group_key?: string | null
          id?: string
          label?: string
          path?: string
          perm_key?: string
          updated_at?: string
        }
        Relationships: []
      }
      product_barcodes: {
        Row: {
          created_at: string
          created_by: string | null
          product_barcode: string
          sku_code: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          product_barcode: string
          sku_code: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          product_barcode?: string
          sku_code?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_barcodes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_barcodes_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      production_bom_approval_logs: {
        Row: {
          action: string
          approval_id: string
          approver_code: string | null
          approver_profile_id: string
          created_at: string
          detail: Json | null
          id: string
        }
        Insert: {
          action: string
          approval_id: string
          approver_code?: string | null
          approver_profile_id: string
          created_at?: string
          detail?: Json | null
          id?: string
        }
        Update: {
          action?: string
          approval_id?: string
          approver_code?: string | null
          approver_profile_id?: string
          created_at?: string
          detail?: Json | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_bom_approval_logs_approval_id_fkey"
            columns: ["approval_id"]
            isOneToOne: false
            referencedRelation: "production_bom_approvals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_bom_approval_logs_approver_profile_id_fkey"
            columns: ["approver_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      production_bom_approvals: {
        Row: {
          bom_id: string
          decided_at: string | null
          decided_by: string | null
          id: string
          reason: string | null
          requested_at: string
          requested_by: string | null
          status: string
          token_id: string
          version_id: string
        }
        Insert: {
          bom_id: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          reason?: string | null
          requested_at?: string
          requested_by?: string | null
          status: string
          token_id: string
          version_id: string
        }
        Update: {
          bom_id?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          reason?: string | null
          requested_at?: string
          requested_by?: string | null
          status?: string
          token_id?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_bom_approvals_bom_id_fkey"
            columns: ["bom_id"]
            isOneToOne: false
            referencedRelation: "production_boms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_bom_approvals_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "production_bom_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      production_bom_formulas: {
        Row: {
          bom_id: string
          created_at: string
          created_by: string | null
          formula_code: string
          formula_name: string
          id: string
          is_active: boolean
          is_default: boolean
          note: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          bom_id: string
          created_at?: string
          created_by?: string | null
          formula_code?: string
          formula_name?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          note?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          bom_id?: string
          created_at?: string
          created_by?: string | null
          formula_code?: string
          formula_name?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          note?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "production_bom_formulas_bom_id_fkey"
            columns: ["bom_id"]
            isOneToOne: false
            referencedRelation: "production_boms"
            referencedColumns: ["id"]
          },
        ]
      }
      production_bom_items: {
        Row: {
          calculation_basis: string
          created_at: string
          dough_set_base: number
          dough_set_round_mode: string
          headcount_base: number
          headcount_round_mode: string
          id: string
          machine_base: number
          machine_round_mode: string
          material_goods_code: string | null
          material_sku_code: string
          notes: string | null
          planning_offset_days: number
          qty: number
          uom_name: string | null
          version_id: string
        }
        Insert: {
          calculation_basis?: string
          created_at?: string
          dough_set_base?: number
          dough_set_round_mode?: string
          headcount_base?: number
          headcount_round_mode?: string
          id?: string
          machine_base?: number
          machine_round_mode?: string
          material_goods_code?: string | null
          material_sku_code: string
          notes?: string | null
          planning_offset_days?: number
          qty?: number
          uom_name?: string | null
          version_id: string
        }
        Update: {
          calculation_basis?: string
          created_at?: string
          dough_set_base?: number
          dough_set_round_mode?: string
          headcount_base?: number
          headcount_round_mode?: string
          id?: string
          machine_base?: number
          machine_round_mode?: string
          material_goods_code?: string | null
          material_sku_code?: string
          notes?: string | null
          planning_offset_days?: number
          qty?: number
          uom_name?: string | null
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_bom_items_material_sku_code_fkey"
            columns: ["material_sku_code"]
            isOneToOne: false
            referencedRelation: "products_cache"
            referencedColumns: ["sku_code"]
          },
          {
            foreignKeyName: "production_bom_items_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "production_bom_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      production_bom_versions: {
        Row: {
          base_batch: number
          base_output_boxes: number
          bom_id: string
          changes: Json | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          diff: Json | null
          formula_code: string | null
          formula_name: string | null
          id: string
          note: string | null
          status: string
          version_no: number
          wip_qty_input_mode: string | null
        }
        Insert: {
          base_batch?: number
          base_output_boxes?: number
          bom_id: string
          changes?: Json | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          diff?: Json | null
          formula_code?: string | null
          formula_name?: string | null
          id?: string
          note?: string | null
          status?: string
          version_no: number
          wip_qty_input_mode?: string | null
        }
        Update: {
          base_batch?: number
          base_output_boxes?: number
          bom_id?: string
          changes?: Json | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          diff?: Json | null
          formula_code?: string | null
          formula_name?: string | null
          id?: string
          note?: string | null
          status?: string
          version_no?: number
          wip_qty_input_mode?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "production_bom_versions_bom_id_fkey"
            columns: ["bom_id"]
            isOneToOne: false
            referencedRelation: "production_boms"
            referencedColumns: ["id"]
          },
        ]
      }
      production_boms: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          sku_code: string
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          sku_code: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          sku_code?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "production_boms_sku_code_fkey"
            columns: ["sku_code"]
            isOneToOne: true
            referencedRelation: "products_cache"
            referencedColumns: ["sku_code"]
          },
        ]
      }
      production_categories: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      production_category_products: {
        Row: {
          category_id: string
          created_at: string
          id: string
          sku_code: string
        }
        Insert: {
          category_id: string
          created_at?: string
          id?: string
          sku_code: string
        }
        Update: {
          category_id?: string
          created_at?: string
          id?: string
          sku_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_category_products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "production_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_category_products_sku_code_fkey"
            columns: ["sku_code"]
            isOneToOne: false
            referencedRelation: "products_cache"
            referencedColumns: ["sku_code"]
          },
        ]
      }
      production_daily_work_doc_counter_audits: {
        Row: {
          actor_user_id: string | null
          created_at: string
          doc_no: string
          doc_round: number
          doc_seq: number
          id: number
          machine_code: string
          metadata: Json
          request_id: string | null
          source: string
          year_be: number
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          doc_no: string
          doc_round: number
          doc_seq: number
          id?: number
          machine_code: string
          metadata?: Json
          request_id?: string | null
          source?: string
          year_be: number
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          doc_no?: string
          doc_round?: number
          doc_seq?: number
          id?: number
          machine_code?: string
          metadata?: Json
          request_id?: string | null
          source?: string
          year_be?: number
        }
        Relationships: []
      }
      production_daily_work_doc_counters: {
        Row: {
          last_round: number
          last_seq: number
          machine_code: string
          updated_at: string
          year_be: number
        }
        Insert: {
          last_round?: number
          last_seq?: number
          machine_code: string
          updated_at?: string
          year_be: number
        }
        Update: {
          last_round?: number
          last_seq?: number
          machine_code?: string
          updated_at?: string
          year_be?: number
        }
        Relationships: []
      }
      production_daily_work_log_revisions: {
        Row: {
          action: string
          after_data: Json
          before_data: Json
          created_at: string
          edit_reason: string
          edited_by: string | null
          id: number
          log_id: string
        }
        Insert: {
          action: string
          after_data?: Json
          before_data?: Json
          created_at?: string
          edit_reason: string
          edited_by?: string | null
          id?: number
          log_id: string
        }
        Update: {
          action?: string
          after_data?: Json
          before_data?: Json
          created_at?: string
          edit_reason?: string
          edited_by?: string | null
          id?: number
          log_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_daily_work_log_revisions_log_id_fkey"
            columns: ["log_id"]
            isOneToOne: false
            referencedRelation: "production_daily_work_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      production_daily_work_logs: {
        Row: {
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          conversion_kg_per_unit_snapshot: number | null
          conversion_mode_snapshot: string
          created_at: string
          decimal_scale_snapshot: number
          department_code_snapshot: string | null
          department_id: string | null
          department_name_snapshot: string | null
          description: string | null
          doc_no: string | null
          doc_round: number | null
          doc_seq: number | null
          doc_status: string
          doc_year_be: number | null
          edit_reason: string | null
          edited_at: string | null
          edited_by: string | null
          employee_branch_snapshot: string | null
          employee_check_in_snapshot: string | null
          employee_check_out_snapshot: string | null
          employee_code: string
          employee_department_snapshot: string | null
          employee_name_snapshot: string | null
          filling_value_snapshot: string | null
          id: string
          is_edited: boolean
          logged_at: string
          machine_code: string | null
          metadata: Json
          normalized_kg_amount_snapshot: number
          operator_user_id: string | null
          operator_username_snapshot: string | null
          pay_rate_per_kg_snapshot: number
          raw_qr_payload: string | null
          replaced_by_doc_no: string | null
          replaced_by_log_id: string | null
          request_id: string
          revised_from_doc_no: string | null
          revised_from_log_id: string | null
          size_value_snapshot: string | null
          source: string
          unit_label_snapshot: string
          value_amount: number
          value_kind_snapshot: string
          value_label_snapshot: string
          wage_amount_snapshot: number
          work_type_code_snapshot: string
          work_type_id: string
          work_type_name_snapshot: string
        }
        Insert: {
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          conversion_kg_per_unit_snapshot?: number | null
          conversion_mode_snapshot?: string
          created_at?: string
          decimal_scale_snapshot?: number
          department_code_snapshot?: string | null
          department_id?: string | null
          department_name_snapshot?: string | null
          description?: string | null
          doc_no?: string | null
          doc_round?: number | null
          doc_seq?: number | null
          doc_status?: string
          doc_year_be?: number | null
          edit_reason?: string | null
          edited_at?: string | null
          edited_by?: string | null
          employee_branch_snapshot?: string | null
          employee_check_in_snapshot?: string | null
          employee_check_out_snapshot?: string | null
          employee_code: string
          employee_department_snapshot?: string | null
          employee_name_snapshot?: string | null
          filling_value_snapshot?: string | null
          id?: string
          is_edited?: boolean
          logged_at?: string
          machine_code?: string | null
          metadata?: Json
          normalized_kg_amount_snapshot?: number
          operator_user_id?: string | null
          operator_username_snapshot?: string | null
          pay_rate_per_kg_snapshot?: number
          raw_qr_payload?: string | null
          replaced_by_doc_no?: string | null
          replaced_by_log_id?: string | null
          request_id: string
          revised_from_doc_no?: string | null
          revised_from_log_id?: string | null
          size_value_snapshot?: string | null
          source?: string
          unit_label_snapshot: string
          value_amount: number
          value_kind_snapshot: string
          value_label_snapshot: string
          wage_amount_snapshot?: number
          work_type_code_snapshot: string
          work_type_id: string
          work_type_name_snapshot: string
        }
        Update: {
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          conversion_kg_per_unit_snapshot?: number | null
          conversion_mode_snapshot?: string
          created_at?: string
          decimal_scale_snapshot?: number
          department_code_snapshot?: string | null
          department_id?: string | null
          department_name_snapshot?: string | null
          description?: string | null
          doc_no?: string | null
          doc_round?: number | null
          doc_seq?: number | null
          doc_status?: string
          doc_year_be?: number | null
          edit_reason?: string | null
          edited_at?: string | null
          edited_by?: string | null
          employee_branch_snapshot?: string | null
          employee_check_in_snapshot?: string | null
          employee_check_out_snapshot?: string | null
          employee_code?: string
          employee_department_snapshot?: string | null
          employee_name_snapshot?: string | null
          filling_value_snapshot?: string | null
          id?: string
          is_edited?: boolean
          logged_at?: string
          machine_code?: string | null
          metadata?: Json
          normalized_kg_amount_snapshot?: number
          operator_user_id?: string | null
          operator_username_snapshot?: string | null
          pay_rate_per_kg_snapshot?: number
          raw_qr_payload?: string | null
          replaced_by_doc_no?: string | null
          replaced_by_log_id?: string | null
          request_id?: string
          revised_from_doc_no?: string | null
          revised_from_log_id?: string | null
          size_value_snapshot?: string | null
          source?: string
          unit_label_snapshot?: string
          value_amount?: number
          value_kind_snapshot?: string
          value_label_snapshot?: string
          wage_amount_snapshot?: number
          work_type_code_snapshot?: string
          work_type_id?: string
          work_type_name_snapshot?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_daily_work_logs_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "production_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_daily_work_logs_replaced_by_log_id_fkey"
            columns: ["replaced_by_log_id"]
            isOneToOne: false
            referencedRelation: "production_daily_work_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_daily_work_logs_revised_from_log_id_fkey"
            columns: ["revised_from_log_id"]
            isOneToOne: false
            referencedRelation: "production_daily_work_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_daily_work_logs_work_type_id_fkey"
            columns: ["work_type_id"]
            isOneToOne: false
            referencedRelation: "production_work_types"
            referencedColumns: ["id"]
          },
        ]
      }
      production_delivery_points: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      production_department_capacities: {
        Row: {
          capacity_batch: number
          created_at: string
          created_by: string | null
          department_id: string
          id: number
          note: string | null
          policy_code: string | null
          reserved_batch: number
          updated_at: string
          updated_by: string | null
          work_date: string
        }
        Insert: {
          capacity_batch?: number
          created_at?: string
          created_by?: string | null
          department_id: string
          id?: number
          note?: string | null
          policy_code?: string | null
          reserved_batch?: number
          updated_at?: string
          updated_by?: string | null
          work_date: string
        }
        Update: {
          capacity_batch?: number
          created_at?: string
          created_by?: string | null
          department_id?: string
          id?: number
          note?: string | null
          policy_code?: string | null
          reserved_batch?: number
          updated_at?: string
          updated_by?: string | null
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_department_capacities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_department_capacities_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "production_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_department_capacities_policy_code_fkey"
            columns: ["policy_code"]
            isOneToOne: false
            referencedRelation: "production_planning_policies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "production_department_capacities_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      production_department_delegations: {
        Row: {
          created_at: string
          created_by: string | null
          delegate_user_id: string
          delegator_user_id: string
          department_id: string
          id: number
          is_active: boolean
          note: string | null
          permissions: string[]
          updated_at: string
          updated_by: string | null
          valid_from: string
          valid_to: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          delegate_user_id: string
          delegator_user_id: string
          department_id: string
          id?: number
          is_active?: boolean
          note?: string | null
          permissions?: string[]
          updated_at?: string
          updated_by?: string | null
          valid_from: string
          valid_to: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          delegate_user_id?: string
          delegator_user_id?: string
          department_id?: string
          id?: number
          is_active?: boolean
          note?: string | null
          permissions?: string[]
          updated_at?: string
          updated_by?: string | null
          valid_from?: string
          valid_to?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_department_delegations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_department_delegations_delegate_user_id_fkey"
            columns: ["delegate_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_department_delegations_delegator_user_id_fkey"
            columns: ["delegator_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_department_delegations_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "production_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_department_delegations_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      production_department_products: {
        Row: {
          created_at: string
          created_by: string | null
          department_id: string
          id: number
          is_owner: boolean
          sku_code: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          department_id: string
          id?: number
          is_owner?: boolean
          sku_code: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          department_id?: string
          id?: number
          is_owner?: boolean
          sku_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_department_products_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "production_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_department_products_sku_code_fkey"
            columns: ["sku_code"]
            isOneToOne: false
            referencedRelation: "products_cache"
            referencedColumns: ["sku_code"]
          },
        ]
      }
      production_department_users: {
        Row: {
          created_at: string
          created_by: string | null
          department_id: string
          id: number
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          department_id: string
          id?: number
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          department_id?: string
          id?: number
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_department_users_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "production_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_department_users_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      production_departments: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          id: string
          is_active: boolean
          is_central_department: boolean
          name: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_central_department?: boolean
          name: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_central_department?: boolean
          name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      production_erp_export_batches: {
        Row: {
          date_from: string
          date_to: string
          document_count: number
          document_type: string
          exported_at: string
          exported_by: string | null
          file_name: string
          id: string
          metadata: Json
          row_count: number
          source_module: string
          status: string
        }
        Insert: {
          date_from: string
          date_to: string
          document_count?: number
          document_type: string
          exported_at?: string
          exported_by?: string | null
          file_name: string
          id?: string
          metadata?: Json
          row_count?: number
          source_module: string
          status?: string
        }
        Update: {
          date_from?: string
          date_to?: string
          document_count?: number
          document_type?: string
          exported_at?: string
          exported_by?: string | null
          file_name?: string
          id?: string
          metadata?: Json
          row_count?: number
          source_module?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_erp_export_batches_exported_by_fkey"
            columns: ["exported_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      production_erp_export_documents: {
        Row: {
          batch_id: string
          created_at: string
          created_by: string | null
          document_date: string
          document_no: string
          document_note: string
          document_type: string
          id: string
          metadata: Json
          period_ym: string
          row_count: number
          running_no: number
          source_module: string
        }
        Insert: {
          batch_id: string
          created_at?: string
          created_by?: string | null
          document_date: string
          document_no: string
          document_note: string
          document_type: string
          id?: string
          metadata?: Json
          period_ym: string
          row_count?: number
          running_no: number
          source_module: string
        }
        Update: {
          batch_id?: string
          created_at?: string
          created_by?: string | null
          document_date?: string
          document_no?: string
          document_note?: string
          document_type?: string
          id?: string
          metadata?: Json
          period_ym?: string
          row_count?: number
          running_no?: number
          source_module?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_erp_export_documents_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "production_erp_export_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_erp_export_documents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      production_erp_export_lines: {
        Row: {
          batch_id: string
          branch_code: string
          created_at: string
          department_code: string
          display_price: number
          document_date: string
          document_id: string
          document_no: string
          expiry_date: string
          id: string
          line_no: number
          lot_no: string
          metadata: Json
          production_date: string
          project_code: string
          quantity: number
          source_receipt_id: string | null
          storage_location: string
          tracking_no: string | null
          trade_code: string
          unit_price: number | null
          unit_weight_kg: number
        }
        Insert: {
          batch_id: string
          branch_code?: string
          created_at?: string
          department_code?: string
          display_price?: number
          document_date: string
          document_id: string
          document_no: string
          expiry_date: string
          id?: string
          line_no: number
          lot_no: string
          metadata?: Json
          production_date: string
          project_code?: string
          quantity?: number
          source_receipt_id?: string | null
          storage_location?: string
          tracking_no?: string | null
          trade_code: string
          unit_price?: number | null
          unit_weight_kg: number
        }
        Update: {
          batch_id?: string
          branch_code?: string
          created_at?: string
          department_code?: string
          display_price?: number
          document_date?: string
          document_id?: string
          document_no?: string
          expiry_date?: string
          id?: string
          line_no?: number
          lot_no?: string
          metadata?: Json
          production_date?: string
          project_code?: string
          quantity?: number
          source_receipt_id?: string | null
          storage_location?: string
          tracking_no?: string | null
          trade_code?: string
          unit_price?: number | null
          unit_weight_kg?: number
        }
        Relationships: [
          {
            foreignKeyName: "production_erp_export_lines_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "production_erp_export_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_erp_export_lines_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "production_erp_export_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_erp_export_lines_source_receipt_id_fkey"
            columns: ["source_receipt_id"]
            isOneToOne: false
            referencedRelation: "production_weight_receipts"
            referencedColumns: ["id"]
          },
        ]
      }
      production_erp_export_sequences: {
        Row: {
          document_type: string
          last_value: number
          period_ym: string
          sequence_key: string
          updated_at: string
        }
        Insert: {
          document_type: string
          last_value?: number
          period_ym: string
          sequence_key: string
          updated_at?: string
        }
        Update: {
          document_type?: string
          last_value?: number
          period_ym?: string
          sequence_key?: string
          updated_at?: string
        }
        Relationships: []
      }
      production_master_plan_snapshots: {
        Row: {
          created_at: string
          id: number
          master_plan_no: string
          published_at: string
          published_by: string | null
          published_by_name: string | null
          snapshot_bom: Json
          snapshot_checksum: string
          snapshot_lead_time: Json
          snapshot_material_requirements: Json
          snapshot_meta: Json
          snapshot_open_mo: Json
          snapshot_open_po: Json
          snapshot_stock: Json
        }
        Insert: {
          created_at?: string
          id?: number
          master_plan_no: string
          published_at: string
          published_by?: string | null
          published_by_name?: string | null
          snapshot_bom?: Json
          snapshot_checksum: string
          snapshot_lead_time?: Json
          snapshot_material_requirements?: Json
          snapshot_meta?: Json
          snapshot_open_mo?: Json
          snapshot_open_po?: Json
          snapshot_stock?: Json
        }
        Update: {
          created_at?: string
          id?: number
          master_plan_no?: string
          published_at?: string
          published_by?: string | null
          published_by_name?: string | null
          snapshot_bom?: Json
          snapshot_checksum?: string
          snapshot_lead_time?: Json
          snapshot_material_requirements?: Json
          snapshot_meta?: Json
          snapshot_open_mo?: Json
          snapshot_open_po?: Json
          snapshot_stock?: Json
        }
        Relationships: [
          {
            foreignKeyName: "production_master_plan_snapshots_master_plan_no_fkey"
            columns: ["master_plan_no"]
            isOneToOne: false
            referencedRelation: "production_master_plans"
            referencedColumns: ["master_plan_no"]
          },
          {
            foreignKeyName: "production_master_plan_snapshots_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      production_master_plans: {
        Row: {
          created_at: string
          created_by: string | null
          id: number
          master_plan_no: string
          note: string | null
          period_end: string
          period_start: string
          published_at: string | null
          published_by: string | null
          published_by_name: string | null
          reject_reason: string | null
          snapshot_bom: Json
          snapshot_frozen_at: string | null
          snapshot_frozen_by: string | null
          snapshot_lead_time: Json
          snapshot_material_requirements: Json
          snapshot_meta: Json
          snapshot_open_mo: Json
          snapshot_open_po: Json
          snapshot_stock: Json
          status: string
          updated_at: string
          updated_by: string | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: number
          master_plan_no: string
          note?: string | null
          period_end: string
          period_start: string
          published_at?: string | null
          published_by?: string | null
          published_by_name?: string | null
          reject_reason?: string | null
          snapshot_bom?: Json
          snapshot_frozen_at?: string | null
          snapshot_frozen_by?: string | null
          snapshot_lead_time?: Json
          snapshot_material_requirements?: Json
          snapshot_meta?: Json
          snapshot_open_mo?: Json
          snapshot_open_po?: Json
          snapshot_stock?: Json
          status?: string
          updated_at?: string
          updated_by?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: number
          master_plan_no?: string
          note?: string | null
          period_end?: string
          period_start?: string
          published_at?: string | null
          published_by?: string | null
          published_by_name?: string | null
          reject_reason?: string | null
          snapshot_bom?: Json
          snapshot_frozen_at?: string | null
          snapshot_frozen_by?: string | null
          snapshot_lead_time?: Json
          snapshot_material_requirements?: Json
          snapshot_meta?: Json
          snapshot_open_mo?: Json
          snapshot_open_po?: Json
          snapshot_stock?: Json
          status?: string
          updated_at?: string
          updated_by?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "production_master_plans_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_master_plans_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_master_plans_snapshot_frozen_by_fkey"
            columns: ["snapshot_frozen_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_master_plans_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      production_material_claim_events: {
        Row: {
          action: string
          actor_id: string | null
          bucket_date: string
          claim_grain: string
          created_at: string
          demand_source: string | null
          from_department_id: string | null
          id: number
          master_plan_no: string
          material_goods_code: string
          material_sku_code: string
          metadata: Json
          owner_department_id: string | null
          reason: string | null
          to_department_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          bucket_date: string
          claim_grain: string
          created_at?: string
          demand_source?: string | null
          from_department_id?: string | null
          id?: number
          master_plan_no: string
          material_goods_code: string
          material_sku_code: string
          metadata?: Json
          owner_department_id?: string | null
          reason?: string | null
          to_department_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          bucket_date?: string
          claim_grain?: string
          created_at?: string
          demand_source?: string | null
          from_department_id?: string | null
          id?: number
          master_plan_no?: string
          material_goods_code?: string
          material_sku_code?: string
          metadata?: Json
          owner_department_id?: string | null
          reason?: string | null
          to_department_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "production_material_claim_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_material_claim_events_from_department_id_fkey"
            columns: ["from_department_id"]
            isOneToOne: false
            referencedRelation: "production_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_material_claim_events_master_plan_no_fkey"
            columns: ["master_plan_no"]
            isOneToOne: false
            referencedRelation: "production_master_plans"
            referencedColumns: ["master_plan_no"]
          },
          {
            foreignKeyName: "production_material_claim_events_material_sku_code_fkey"
            columns: ["material_sku_code"]
            isOneToOne: false
            referencedRelation: "products_cache"
            referencedColumns: ["sku_code"]
          },
          {
            foreignKeyName: "production_material_claim_events_owner_department_id_fkey"
            columns: ["owner_department_id"]
            isOneToOne: false
            referencedRelation: "production_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_material_claim_events_to_department_id_fkey"
            columns: ["to_department_id"]
            isOneToOne: false
            referencedRelation: "production_departments"
            referencedColumns: ["id"]
          },
        ]
      }
      production_material_claims_daily: {
        Row: {
          claimed_at: string
          claimed_by: string | null
          created_at: string
          created_by: string | null
          demand_source: string
          department_id: string
          id: number
          master_plan_no: string
          material_goods_code: string
          material_sku_code: string
          note: string | null
          override_issue_qty: number | null
          owner_department_id: string | null
          released_at: string | null
          released_by: string | null
          source: string
          status: string
          updated_at: string
          updated_by: string | null
          work_date: string
        }
        Insert: {
          claimed_at?: string
          claimed_by?: string | null
          created_at?: string
          created_by?: string | null
          demand_source?: string
          department_id: string
          id?: number
          master_plan_no: string
          material_goods_code: string
          material_sku_code: string
          note?: string | null
          override_issue_qty?: number | null
          owner_department_id?: string | null
          released_at?: string | null
          released_by?: string | null
          source?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
          work_date: string
        }
        Update: {
          claimed_at?: string
          claimed_by?: string | null
          created_at?: string
          created_by?: string | null
          demand_source?: string
          department_id?: string
          id?: number
          master_plan_no?: string
          material_goods_code?: string
          material_sku_code?: string
          note?: string | null
          override_issue_qty?: number | null
          owner_department_id?: string | null
          released_at?: string | null
          released_by?: string | null
          source?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_material_claims_daily_claimed_by_fkey"
            columns: ["claimed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_material_claims_daily_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_material_claims_daily_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "production_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_material_claims_daily_master_plan_no_fkey"
            columns: ["master_plan_no"]
            isOneToOne: false
            referencedRelation: "production_master_plans"
            referencedColumns: ["master_plan_no"]
          },
          {
            foreignKeyName: "production_material_claims_daily_material_sku_code_fkey"
            columns: ["material_sku_code"]
            isOneToOne: false
            referencedRelation: "products_cache"
            referencedColumns: ["sku_code"]
          },
          {
            foreignKeyName: "production_material_claims_daily_owner_department_id_fkey"
            columns: ["owner_department_id"]
            isOneToOne: false
            referencedRelation: "production_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_material_claims_daily_released_by_fkey"
            columns: ["released_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_material_claims_daily_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      production_material_claims_weekly: {
        Row: {
          claimed_at: string
          claimed_by: string | null
          created_at: string
          created_by: string | null
          demand_source: string
          department_id: string
          id: number
          master_plan_no: string
          material_goods_code: string
          material_sku_code: string
          note: string | null
          override_issue_qty: number | null
          owner_department_id: string | null
          released_at: string | null
          released_by: string | null
          source: string
          status: string
          updated_at: string
          updated_by: string | null
          week_start_date: string
        }
        Insert: {
          claimed_at?: string
          claimed_by?: string | null
          created_at?: string
          created_by?: string | null
          demand_source?: string
          department_id: string
          id?: number
          master_plan_no: string
          material_goods_code: string
          material_sku_code: string
          note?: string | null
          override_issue_qty?: number | null
          owner_department_id?: string | null
          released_at?: string | null
          released_by?: string | null
          source?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
          week_start_date: string
        }
        Update: {
          claimed_at?: string
          claimed_by?: string | null
          created_at?: string
          created_by?: string | null
          demand_source?: string
          department_id?: string
          id?: number
          master_plan_no?: string
          material_goods_code?: string
          material_sku_code?: string
          note?: string | null
          override_issue_qty?: number | null
          owner_department_id?: string | null
          released_at?: string | null
          released_by?: string | null
          source?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
          week_start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_material_claims_weekly_claimed_by_fkey"
            columns: ["claimed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_material_claims_weekly_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_material_claims_weekly_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "production_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_material_claims_weekly_master_plan_no_fkey"
            columns: ["master_plan_no"]
            isOneToOne: false
            referencedRelation: "production_master_plans"
            referencedColumns: ["master_plan_no"]
          },
          {
            foreignKeyName: "production_material_claims_weekly_material_sku_code_fkey"
            columns: ["material_sku_code"]
            isOneToOne: false
            referencedRelation: "products_cache"
            referencedColumns: ["sku_code"]
          },
          {
            foreignKeyName: "production_material_claims_weekly_owner_department_id_fkey"
            columns: ["owner_department_id"]
            isOneToOne: false
            referencedRelation: "production_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_material_claims_weekly_released_by_fkey"
            columns: ["released_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_material_claims_weekly_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      production_material_owners: {
        Row: {
          created_at: string
          created_by: string | null
          department_id: string
          id: number
          material_sku_code: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          department_id: string
          id?: number
          material_sku_code: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          department_id?: string
          id?: number
          material_sku_code?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "production_material_owners_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_material_owners_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "production_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_material_owners_material_sku_code_fkey"
            columns: ["material_sku_code"]
            isOneToOne: false
            referencedRelation: "products_cache"
            referencedColumns: ["sku_code"]
          },
          {
            foreignKeyName: "production_material_owners_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      production_material_verify_confirmations: {
        Row: {
          assigned_department_id: string
          bucket_date: string
          created_at: string
          grain: string
          id: string
          master_plan_no: string
          material_goods_code: string
          material_sku_code: string
          note: string | null
          updated_at: string
          verified_at: string
          verified_by: string | null
        }
        Insert: {
          assigned_department_id: string
          bucket_date: string
          created_at?: string
          grain?: string
          id?: string
          master_plan_no: string
          material_goods_code: string
          material_sku_code: string
          note?: string | null
          updated_at?: string
          verified_at?: string
          verified_by?: string | null
        }
        Update: {
          assigned_department_id?: string
          bucket_date?: string
          created_at?: string
          grain?: string
          id?: string
          master_plan_no?: string
          material_goods_code?: string
          material_sku_code?: string
          note?: string | null
          updated_at?: string
          verified_at?: string
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "production_material_verify_confirma_assigned_department_id_fkey"
            columns: ["assigned_department_id"]
            isOneToOne: false
            referencedRelation: "production_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_material_verify_confirmations_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      production_piece_rate_log_revisions: {
        Row: {
          action: string
          after_data: Json
          before_data: Json
          created_at: string
          edit_reason: string
          edited_by: string | null
          id: number
          log_id: string
        }
        Insert: {
          action: string
          after_data?: Json
          before_data?: Json
          created_at?: string
          edit_reason: string
          edited_by?: string | null
          id?: number
          log_id: string
        }
        Update: {
          action?: string
          after_data?: Json
          before_data?: Json
          created_at?: string
          edit_reason?: string
          edited_by?: string | null
          id?: number
          log_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_piece_rate_log_revisions_log_id_fkey"
            columns: ["log_id"]
            isOneToOne: false
            referencedRelation: "production_piece_rate_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      production_piece_rate_logs: {
        Row: {
          actual_weighed_at: string | null
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          count_value_snapshot: number
          created_at: string
          doc_no: string
          doc_round: number
          doc_seq: number
          doc_status: string
          doc_year_be: number
          edit_reason: string | null
          edited_at: string | null
          edited_by: string | null
          employee_branch_snapshot: string | null
          employee_check_in_snapshot: string | null
          employee_check_out_snapshot: string | null
          employee_code: string
          employee_department_snapshot: string | null
          employee_name_snapshot: string | null
          id: string
          input_label_snapshot: string
          input_mode_snapshot: string
          input_unit_label_snapshot: string
          input_value: number
          is_edited: boolean
          kg_per_pail_snapshot: number | null
          logged_at: string
          machine_code: string
          metadata: Json
          normalized_kg_amount_snapshot: number
          operator_user_id: string | null
          operator_username_snapshot: string | null
          pay_rate_per_kg_snapshot: number
          pay_rate_per_unit_snapshot: number
          piece_rate_profile_id: string | null
          piece_rate_profile_name_snapshot: string
          product_barcode_snapshot: string
          product_brand_code_snapshot: string | null
          product_brand_name_snapshot: string | null
          product_code_snapshot: string
          product_goods_code_snapshot: string | null
          product_name_snapshot: string
          product_sku_code_snapshot: string | null
          product_unit_snapshot: string | null
          raw_employee_qr_payload: string | null
          raw_product_barcode_payload: string | null
          replaced_by_doc_no: string | null
          replaced_by_log_id: string | null
          request_id: string
          revised_from_doc_no: string | null
          revised_from_log_id: string | null
          source: string
          wage_amount_snapshot: number
          wage_basis_snapshot: string
          weight_kg_snapshot: number | null
          weight_option_id_snapshot: string | null
          weight_option_label_snapshot: string | null
        }
        Insert: {
          actual_weighed_at?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          count_value_snapshot?: number
          created_at?: string
          doc_no: string
          doc_round: number
          doc_seq: number
          doc_status?: string
          doc_year_be: number
          edit_reason?: string | null
          edited_at?: string | null
          edited_by?: string | null
          employee_branch_snapshot?: string | null
          employee_check_in_snapshot?: string | null
          employee_check_out_snapshot?: string | null
          employee_code: string
          employee_department_snapshot?: string | null
          employee_name_snapshot?: string | null
          id?: string
          input_label_snapshot: string
          input_mode_snapshot: string
          input_unit_label_snapshot: string
          input_value: number
          is_edited?: boolean
          kg_per_pail_snapshot?: number | null
          logged_at?: string
          machine_code: string
          metadata?: Json
          normalized_kg_amount_snapshot: number
          operator_user_id?: string | null
          operator_username_snapshot?: string | null
          pay_rate_per_kg_snapshot?: number
          pay_rate_per_unit_snapshot?: number
          piece_rate_profile_id?: string | null
          piece_rate_profile_name_snapshot: string
          product_barcode_snapshot: string
          product_brand_code_snapshot?: string | null
          product_brand_name_snapshot?: string | null
          product_code_snapshot: string
          product_goods_code_snapshot?: string | null
          product_name_snapshot: string
          product_sku_code_snapshot?: string | null
          product_unit_snapshot?: string | null
          raw_employee_qr_payload?: string | null
          raw_product_barcode_payload?: string | null
          replaced_by_doc_no?: string | null
          replaced_by_log_id?: string | null
          request_id: string
          revised_from_doc_no?: string | null
          revised_from_log_id?: string | null
          source?: string
          wage_amount_snapshot?: number
          wage_basis_snapshot?: string
          weight_kg_snapshot?: number | null
          weight_option_id_snapshot?: string | null
          weight_option_label_snapshot?: string | null
        }
        Update: {
          actual_weighed_at?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          count_value_snapshot?: number
          created_at?: string
          doc_no?: string
          doc_round?: number
          doc_seq?: number
          doc_status?: string
          doc_year_be?: number
          edit_reason?: string | null
          edited_at?: string | null
          edited_by?: string | null
          employee_branch_snapshot?: string | null
          employee_check_in_snapshot?: string | null
          employee_check_out_snapshot?: string | null
          employee_code?: string
          employee_department_snapshot?: string | null
          employee_name_snapshot?: string | null
          id?: string
          input_label_snapshot?: string
          input_mode_snapshot?: string
          input_unit_label_snapshot?: string
          input_value?: number
          is_edited?: boolean
          kg_per_pail_snapshot?: number | null
          logged_at?: string
          machine_code?: string
          metadata?: Json
          normalized_kg_amount_snapshot?: number
          operator_user_id?: string | null
          operator_username_snapshot?: string | null
          pay_rate_per_kg_snapshot?: number
          pay_rate_per_unit_snapshot?: number
          piece_rate_profile_id?: string | null
          piece_rate_profile_name_snapshot?: string
          product_barcode_snapshot?: string
          product_brand_code_snapshot?: string | null
          product_brand_name_snapshot?: string | null
          product_code_snapshot?: string
          product_goods_code_snapshot?: string | null
          product_name_snapshot?: string
          product_sku_code_snapshot?: string | null
          product_unit_snapshot?: string | null
          raw_employee_qr_payload?: string | null
          raw_product_barcode_payload?: string | null
          replaced_by_doc_no?: string | null
          replaced_by_log_id?: string | null
          request_id?: string
          revised_from_doc_no?: string | null
          revised_from_log_id?: string | null
          source?: string
          wage_amount_snapshot?: number
          wage_basis_snapshot?: string
          weight_kg_snapshot?: number | null
          weight_option_id_snapshot?: string | null
          weight_option_label_snapshot?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "production_piece_rate_logs_piece_rate_profile_id_fkey"
            columns: ["piece_rate_profile_id"]
            isOneToOne: false
            referencedRelation: "production_piece_rate_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_piece_rate_logs_product_code_snapshot_fkey"
            columns: ["product_code_snapshot"]
            isOneToOne: false
            referencedRelation: "products_cache"
            referencedColumns: ["sku_code"]
          },
          {
            foreignKeyName: "production_piece_rate_logs_replaced_by_log_id_fkey"
            columns: ["replaced_by_log_id"]
            isOneToOne: false
            referencedRelation: "production_piece_rate_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_piece_rate_logs_revised_from_log_id_fkey"
            columns: ["revised_from_log_id"]
            isOneToOne: false
            referencedRelation: "production_piece_rate_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      production_piece_rate_product_mappings: {
        Row: {
          created_at: string
          created_by: string | null
          product_code: string
          profile_id: string
          sku_code: string | null
          updated_at: string
          updated_by: string | null
          weight_option_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          product_code: string
          profile_id: string
          sku_code?: string | null
          updated_at?: string
          updated_by?: string | null
          weight_option_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          product_code?: string
          profile_id?: string
          sku_code?: string | null
          updated_at?: string
          updated_by?: string | null
          weight_option_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "production_piece_rate_product_mappings_product_code_fkey"
            columns: ["product_code"]
            isOneToOne: true
            referencedRelation: "products_cache"
            referencedColumns: ["sku_code"]
          },
          {
            foreignKeyName: "production_piece_rate_product_mappings_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "production_piece_rate_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_piece_rate_product_mappings_weight_option_id_fkey"
            columns: ["weight_option_id"]
            isOneToOne: false
            referencedRelation: "production_piece_rate_profile_weights"
            referencedColumns: ["id"]
          },
        ]
      }
      production_piece_rate_profile_weights: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          label: string
          profile_id: string
          sort_order: number
          updated_at: string
          updated_by: string | null
          weight_kg: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          label: string
          profile_id: string
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
          weight_kg: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          label?: string
          profile_id?: string
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
          weight_kg?: number
        }
        Relationships: [
          {
            foreignKeyName: "production_piece_rate_profile_weights_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_piece_rate_profile_weights_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "production_piece_rate_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_piece_rate_profile_weights_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      production_piece_rate_profiles: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          input_mode: string
          is_active: boolean
          kg_per_pail: number | null
          name: string
          pay_rate_per_kg: number
          pay_rate_per_unit: number
          sort_order: number
          updated_at: string
          updated_by: string | null
          wage_basis: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          input_mode: string
          is_active?: boolean
          kg_per_pail?: number | null
          name: string
          pay_rate_per_kg?: number
          pay_rate_per_unit?: number
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
          wage_basis?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          input_mode?: string
          is_active?: boolean
          kg_per_pail?: number | null
          name?: string
          pay_rate_per_kg?: number
          pay_rate_per_unit?: number
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
          wage_basis?: string
        }
        Relationships: []
      }
      production_piece_rate_waste_logs: {
        Row: {
          actual_weighed_at: string
          cancelled_at: string | null
          cancelled_by: string | null
          id: string
          logged_at: string
          machine_code: string
          metadata: Json
          operator_user_id: string | null
          product_barcode_snapshot: string
          product_brand_code_snapshot: string | null
          product_brand_name_snapshot: string | null
          product_code_snapshot: string
          product_goods_code_snapshot: string | null
          product_name_snapshot: string
          product_sku_code_snapshot: string | null
          product_unit_snapshot: string | null
          raw_product_barcode_payload: string | null
          request_id: string
          status: string
          waste_weight_kg: number
        }
        Insert: {
          actual_weighed_at: string
          cancelled_at?: string | null
          cancelled_by?: string | null
          id?: string
          logged_at?: string
          machine_code: string
          metadata?: Json
          operator_user_id?: string | null
          product_barcode_snapshot: string
          product_brand_code_snapshot?: string | null
          product_brand_name_snapshot?: string | null
          product_code_snapshot: string
          product_goods_code_snapshot?: string | null
          product_name_snapshot: string
          product_sku_code_snapshot?: string | null
          product_unit_snapshot?: string | null
          raw_product_barcode_payload?: string | null
          request_id: string
          status?: string
          waste_weight_kg: number
        }
        Update: {
          actual_weighed_at?: string
          cancelled_at?: string | null
          cancelled_by?: string | null
          id?: string
          logged_at?: string
          machine_code?: string
          metadata?: Json
          operator_user_id?: string | null
          product_barcode_snapshot?: string
          product_brand_code_snapshot?: string | null
          product_brand_name_snapshot?: string | null
          product_code_snapshot?: string
          product_goods_code_snapshot?: string | null
          product_name_snapshot?: string
          product_sku_code_snapshot?: string | null
          product_unit_snapshot?: string | null
          raw_product_barcode_payload?: string | null
          request_id?: string
          status?: string
          waste_weight_kg?: number
        }
        Relationships: []
      }
      production_plan_events: {
        Row: {
          actor_id: string | null
          actor_name: string | null
          created_at: string
          event_type: string
          id: number
          payload: Json
          plan_id: string
          source: string
        }
        Insert: {
          actor_id?: string | null
          actor_name?: string | null
          created_at?: string
          event_type: string
          id?: number
          payload?: Json
          plan_id: string
          source?: string
        }
        Update: {
          actor_id?: string | null
          actor_name?: string | null
          created_at?: string
          event_type?: string
          id?: number
          payload?: Json
          plan_id?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_plan_events_plan_fk"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "production_plan_status"
            referencedColumns: ["plan_id"]
          },
        ]
      }
      production_plan_material_overrides: {
        Row: {
          base_issue_qty: number
          base_required_qty: number
          created_at: string
          edited_at: string
          edited_by: string | null
          edited_by_user_id: string | null
          issue_qty: number
          material_name: string | null
          material_sku_code: string
          mode: string
          plan_id: string
          reason: string
          required_qty: number
          snapshot_generated_at: string | null
          source: string
          updated_at: string
        }
        Insert: {
          base_issue_qty?: number
          base_required_qty?: number
          created_at?: string
          edited_at?: string
          edited_by?: string | null
          edited_by_user_id?: string | null
          issue_qty?: number
          material_name?: string | null
          material_sku_code: string
          mode: string
          plan_id: string
          reason: string
          required_qty?: number
          snapshot_generated_at?: string | null
          source?: string
          updated_at?: string
        }
        Update: {
          base_issue_qty?: number
          base_required_qty?: number
          created_at?: string
          edited_at?: string
          edited_by?: string | null
          edited_by_user_id?: string | null
          issue_qty?: number
          material_name?: string | null
          material_sku_code?: string
          mode?: string
          plan_id?: string
          reason?: string
          required_qty?: number
          snapshot_generated_at?: string | null
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_plan_material_overrides_plan_fk"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "production_plan_status"
            referencedColumns: ["plan_id"]
          },
        ]
      }
      production_plan_material_verifications: {
        Row: {
          created_at: string | null
          id: string
          master_plan_no: string | null
          material_code: string
          material_name: string
          required_qty: number
          shortage_qty: number
          status: string
          stock_qty: number
          verified_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          master_plan_no?: string | null
          material_code: string
          material_name: string
          required_qty: number
          shortage_qty?: number
          status?: string
          stock_qty: number
          verified_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          master_plan_no?: string | null
          material_code?: string
          material_name?: string
          required_qty?: number
          shortage_qty?: number
          status?: string
          stock_qty?: number
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "production_plan_material_verifications_master_plan_no_fkey"
            columns: ["master_plan_no"]
            isOneToOne: false
            referencedRelation: "production_master_plans"
            referencedColumns: ["master_plan_no"]
          },
        ]
      }
      production_plan_status: {
        Row: {
          backorder_batch: number | null
          bom_snapshot: Json | null
          bom_version_id: string | null
          capacity_block_reason: string | null
          category_id: string | null
          category_name: string | null
          confirmed_at: string | null
          confirmed_by: string | null
          due_date: string | null
          earliest_material_eta: string | null
          entry_date: string | null
          exception_reason: string | null
          feasible_batch: number | null
          formula_code: string | null
          formula_name: string | null
          inserted_at: string | null
          item_note: string | null
          line_dough_set_count: number | null
          line_machine_no: number | null
          line_staff_count: number | null
          master_plan_no: string | null
          master_published_at: string | null
          master_published_by: string | null
          master_published_by_user_id: string | null
          owner_department_id: string | null
          parent_plan_id: string | null
          period_end: string | null
          period_start: string | null
          plan_group_id: string | null
          plan_id: string
          plan_kind: string | null
          plan_note: string | null
          planned_qty: number | null
          priority_score: number | null
          schedule_section_def_id: string | null
          schedule_section_name: string | null
          scheduled_batch: number | null
          scheduled_end_date: string | null
          scheduled_start_date: string | null
          scheduling_policy_code: string | null
          shift_code: string | null
          shift_id: string | null
          shift_name: string | null
          short_batch: number | null
          sku_code: string
          sku_name: string
          status: string | null
          sub_plan_no: string | null
          t_plus_days: number | null
          unit: string | null
          updated_at: string | null
          work_end_time: string | null
          work_start_time: string | null
        }
        Insert: {
          backorder_batch?: number | null
          bom_snapshot?: Json | null
          bom_version_id?: string | null
          capacity_block_reason?: string | null
          category_id?: string | null
          category_name?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          due_date?: string | null
          earliest_material_eta?: string | null
          entry_date?: string | null
          exception_reason?: string | null
          feasible_batch?: number | null
          formula_code?: string | null
          formula_name?: string | null
          inserted_at?: string | null
          item_note?: string | null
          line_dough_set_count?: number | null
          line_machine_no?: number | null
          line_staff_count?: number | null
          master_plan_no?: string | null
          master_published_at?: string | null
          master_published_by?: string | null
          master_published_by_user_id?: string | null
          owner_department_id?: string | null
          parent_plan_id?: string | null
          period_end?: string | null
          period_start?: string | null
          plan_group_id?: string | null
          plan_id: string
          plan_kind?: string | null
          plan_note?: string | null
          planned_qty?: number | null
          priority_score?: number | null
          schedule_section_def_id?: string | null
          schedule_section_name?: string | null
          scheduled_batch?: number | null
          scheduled_end_date?: string | null
          scheduled_start_date?: string | null
          scheduling_policy_code?: string | null
          shift_code?: string | null
          shift_id?: string | null
          shift_name?: string | null
          short_batch?: number | null
          sku_code: string
          sku_name: string
          status?: string | null
          sub_plan_no?: string | null
          t_plus_days?: number | null
          unit?: string | null
          updated_at?: string | null
          work_end_time?: string | null
          work_start_time?: string | null
        }
        Update: {
          backorder_batch?: number | null
          bom_snapshot?: Json | null
          bom_version_id?: string | null
          capacity_block_reason?: string | null
          category_id?: string | null
          category_name?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          due_date?: string | null
          earliest_material_eta?: string | null
          entry_date?: string | null
          exception_reason?: string | null
          feasible_batch?: number | null
          formula_code?: string | null
          formula_name?: string | null
          inserted_at?: string | null
          item_note?: string | null
          line_dough_set_count?: number | null
          line_machine_no?: number | null
          line_staff_count?: number | null
          master_plan_no?: string | null
          master_published_at?: string | null
          master_published_by?: string | null
          master_published_by_user_id?: string | null
          owner_department_id?: string | null
          parent_plan_id?: string | null
          period_end?: string | null
          period_start?: string | null
          plan_group_id?: string | null
          plan_id?: string
          plan_kind?: string | null
          plan_note?: string | null
          planned_qty?: number | null
          priority_score?: number | null
          schedule_section_def_id?: string | null
          schedule_section_name?: string | null
          scheduled_batch?: number | null
          scheduled_end_date?: string | null
          scheduled_start_date?: string | null
          scheduling_policy_code?: string | null
          shift_code?: string | null
          shift_id?: string | null
          shift_name?: string | null
          short_batch?: number | null
          sku_code?: string
          sku_name?: string
          status?: string | null
          sub_plan_no?: string | null
          t_plus_days?: number | null
          unit?: string | null
          updated_at?: string | null
          work_end_time?: string | null
          work_start_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "production_plan_status_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "production_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_plan_status_owner_department_id_fkey"
            columns: ["owner_department_id"]
            isOneToOne: false
            referencedRelation: "production_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_plan_status_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "production_shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      production_planning_policies: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          description: string | null
          id: number
          is_active: boolean
          name: string
          updated_at: string
          updated_by: string | null
          weight_backorder: number
          weight_due_urgency: number
          weight_plan_kind_main: number
          weight_plan_kind_sub: number
          weight_shortage: number
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: number
          is_active?: boolean
          name: string
          updated_at?: string
          updated_by?: string | null
          weight_backorder?: number
          weight_due_urgency?: number
          weight_plan_kind_main?: number
          weight_plan_kind_sub?: number
          weight_shortage?: number
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: number
          is_active?: boolean
          name?: string
          updated_at?: string
          updated_by?: string | null
          weight_backorder?: number
          weight_due_urgency?: number
          weight_plan_kind_main?: number
          weight_plan_kind_sub?: number
          weight_shortage?: number
        }
        Relationships: [
          {
            foreignKeyName: "production_planning_policies_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_planning_policies_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      production_prison_issue_documents: {
        Row: {
          created_at: string
          created_by: string | null
          department_code: string
          department_id: string
          id: string
          issue_date: string
          issued_at: string
          metadata: Json
          prison_issue_no: string
          remark: string | null
          status: string
          updated_at: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          department_code: string
          department_id: string
          id?: string
          issue_date: string
          issued_at?: string
          metadata?: Json
          prison_issue_no: string
          remark?: string | null
          status?: string
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          department_code?: string
          department_id?: string
          id?: string
          issue_date?: string
          issued_at?: string
          metadata?: Json
          prison_issue_no?: string
          remark?: string | null
          status?: string
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "production_prison_issue_documents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_prison_issue_documents_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "production_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_prison_issue_documents_voided_by_fkey"
            columns: ["voided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      production_prison_issue_items: {
        Row: {
          barcode: string
          category_code: string
          created_at: string
          created_by: string | null
          id: string
          issued_at: string
          lot_no: string
          metadata: Json
          prison_issue_document_id: string
          product_code: string
          product_name_snapshot: string
          quantity: number
          source_issue_document_id: string
          source_issue_item_id: string
          source_receipt_id: string
          status: string
          uom_name: string | null
          updated_at: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
          weight_kg: number
        }
        Insert: {
          barcode: string
          category_code?: string
          created_at?: string
          created_by?: string | null
          id?: string
          issued_at?: string
          lot_no: string
          metadata?: Json
          prison_issue_document_id: string
          product_code: string
          product_name_snapshot: string
          quantity?: number
          source_issue_document_id: string
          source_issue_item_id: string
          source_receipt_id: string
          status?: string
          uom_name?: string | null
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
          weight_kg?: number
        }
        Update: {
          barcode?: string
          category_code?: string
          created_at?: string
          created_by?: string | null
          id?: string
          issued_at?: string
          lot_no?: string
          metadata?: Json
          prison_issue_document_id?: string
          product_code?: string
          product_name_snapshot?: string
          quantity?: number
          source_issue_document_id?: string
          source_issue_item_id?: string
          source_receipt_id?: string
          status?: string
          uom_name?: string | null
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
          weight_kg?: number
        }
        Relationships: [
          {
            foreignKeyName: "production_prison_issue_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_prison_issue_items_prison_issue_document_id_fkey"
            columns: ["prison_issue_document_id"]
            isOneToOne: false
            referencedRelation: "production_prison_inbound_report_lines_v"
            referencedColumns: ["prison_issue_document_id"]
          },
          {
            foreignKeyName: "production_prison_issue_items_prison_issue_document_id_fkey"
            columns: ["prison_issue_document_id"]
            isOneToOne: false
            referencedRelation: "production_prison_issue_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_prison_issue_items_prison_issue_document_id_fkey"
            columns: ["prison_issue_document_id"]
            isOneToOne: false
            referencedRelation: "production_prison_issue_report_lines_v"
            referencedColumns: ["prison_issue_document_id"]
          },
          {
            foreignKeyName: "production_prison_issue_items_product_code_fkey"
            columns: ["product_code"]
            isOneToOne: false
            referencedRelation: "products_cache"
            referencedColumns: ["sku_code"]
          },
          {
            foreignKeyName: "production_prison_issue_items_source_issue_document_id_fkey"
            columns: ["source_issue_document_id"]
            isOneToOne: false
            referencedRelation: "production_prison_inbound_report_lines_v"
            referencedColumns: ["inbound_document_id"]
          },
          {
            foreignKeyName: "production_prison_issue_items_source_issue_document_id_fkey"
            columns: ["source_issue_document_id"]
            isOneToOne: false
            referencedRelation: "production_stock_issue_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_prison_issue_items_source_issue_document_id_fkey"
            columns: ["source_issue_document_id"]
            isOneToOne: false
            referencedRelation: "production_stock_issue_report_lines_v"
            referencedColumns: ["issue_document_id"]
          },
          {
            foreignKeyName: "production_prison_issue_items_source_issue_item_id_fkey"
            columns: ["source_issue_item_id"]
            isOneToOne: false
            referencedRelation: "production_prison_inbound_report_lines_v"
            referencedColumns: ["inbound_item_id"]
          },
          {
            foreignKeyName: "production_prison_issue_items_source_issue_item_id_fkey"
            columns: ["source_issue_item_id"]
            isOneToOne: false
            referencedRelation: "production_stock_issue_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_prison_issue_items_source_issue_item_id_fkey"
            columns: ["source_issue_item_id"]
            isOneToOne: false
            referencedRelation: "production_stock_issue_report_lines_v"
            referencedColumns: ["issue_item_id"]
          },
          {
            foreignKeyName: "production_prison_issue_items_source_issue_item_id_fkey"
            columns: ["source_issue_item_id"]
            isOneToOne: false
            referencedRelation: "production_stock_issue_usage_progress_v"
            referencedColumns: ["source_issue_item_id"]
          },
          {
            foreignKeyName: "production_prison_issue_items_source_receipt_id_fkey"
            columns: ["source_receipt_id"]
            isOneToOne: false
            referencedRelation: "production_weight_receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_prison_issue_items_voided_by_fkey"
            columns: ["voided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      production_report_doc_audits: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          date_from: string
          date_to: string
          doc_no: string
          doc_seq: number
          document_id: number
          id: number
          metadata: Json
          report_type: string
          request_id: string | null
          revision_no: number
          scope_hash: string
          snapshot_hash: string
          view_mode: string
        }
        Insert: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          date_from: string
          date_to: string
          doc_no: string
          doc_seq: number
          document_id: number
          id?: number
          metadata?: Json
          report_type: string
          request_id?: string | null
          revision_no: number
          scope_hash: string
          snapshot_hash: string
          view_mode: string
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          date_from?: string
          date_to?: string
          doc_no?: string
          doc_seq?: number
          document_id?: number
          id?: number
          metadata?: Json
          report_type?: string
          request_id?: string | null
          revision_no?: number
          scope_hash?: string
          snapshot_hash?: string
          view_mode?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_report_doc_audits_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "production_report_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      production_report_doc_counters: {
        Row: {
          date_from: string
          date_to: string
          last_seq: number
          report_type: string
          updated_at: string
        }
        Insert: {
          date_from: string
          date_to: string
          last_seq?: number
          report_type: string
          updated_at?: string
        }
        Update: {
          date_from?: string
          date_to?: string
          last_seq?: number
          report_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      production_report_documents: {
        Row: {
          created_at: string
          created_by: string | null
          date_from: string
          date_to: string
          doc_seq: number
          id: number
          latest_doc_no: string
          latest_issued_at: string
          latest_revision: number
          latest_snapshot_hash: string
          report_type: string
          scope_hash: string
          updated_at: string
          updated_by: string | null
          view_mode: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          date_from: string
          date_to: string
          doc_seq: number
          id?: number
          latest_doc_no: string
          latest_issued_at?: string
          latest_revision?: number
          latest_snapshot_hash: string
          report_type: string
          scope_hash: string
          updated_at?: string
          updated_by?: string | null
          view_mode: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          date_from?: string
          date_to?: string
          doc_seq?: number
          id?: number
          latest_doc_no?: string
          latest_issued_at?: string
          latest_revision?: number
          latest_snapshot_hash?: string
          report_type?: string
          scope_hash?: string
          updated_at?: string
          updated_by?: string | null
          view_mode?: string
        }
        Relationships: []
      }
      production_requisition_document_sequences: {
        Row: {
          last_value: number
          sequence_key: string
          updated_at: string
        }
        Insert: {
          last_value?: number
          sequence_key: string
          updated_at?: string
        }
        Update: {
          last_value?: number
          sequence_key?: string
          updated_at?: string
        }
        Relationships: []
      }
      production_requisition_export_batches: {
        Row: {
          exported_at: string
          exported_by: string | null
          file_name: string
          group_count: number
          id: string
          master_plan_no: string
          metadata: Json
          row_count: number
        }
        Insert: {
          exported_at?: string
          exported_by?: string | null
          file_name: string
          group_count?: number
          id?: string
          master_plan_no: string
          metadata?: Json
          row_count?: number
        }
        Update: {
          exported_at?: string
          exported_by?: string | null
          file_name?: string
          group_count?: number
          id?: string
          master_plan_no?: string
          metadata?: Json
          row_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "production_requisition_export_batches_exported_by_fkey"
            columns: ["exported_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_requisition_export_batches_master_plan_no_fkey"
            columns: ["master_plan_no"]
            isOneToOne: false
            referencedRelation: "production_master_plans"
            referencedColumns: ["master_plan_no"]
          },
        ]
      }
      production_requisition_export_lines: {
        Row: {
          created_at: string
          doc_ref: string
          line_seq: number
          lot_no: string | null
          meta: Json
          qty: number
          remark: string | null
          sku_code: string
          sku_name: string | null
          uom: string | null
          updated_at: string
          warehouse_code: string | null
        }
        Insert: {
          created_at?: string
          doc_ref: string
          line_seq: number
          lot_no?: string | null
          meta?: Json
          qty?: number
          remark?: string | null
          sku_code: string
          sku_name?: string | null
          uom?: string | null
          updated_at?: string
          warehouse_code?: string | null
        }
        Update: {
          created_at?: string
          doc_ref?: string
          line_seq?: number
          lot_no?: string | null
          meta?: Json
          qty?: number
          remark?: string | null
          sku_code?: string
          sku_name?: string | null
          uom?: string | null
          updated_at?: string
          warehouse_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "production_requisition_export_lines_doc_ref_fkey"
            columns: ["doc_ref"]
            isOneToOne: false
            referencedRelation: "production_requisition_exports"
            referencedColumns: ["doc_ref"]
          },
        ]
      }
      production_requisition_exports: {
        Row: {
          created_at: string
          created_by: string | null
          date_from: string | null
          date_to: string | null
          department_id: string | null
          doc_ref: string
          erp_hash: string | null
          erp_last_synced_at: string | null
          export_mode: string
          exported_at: string | null
          exported_by: string | null
          exported_by_name: string | null
          master_plan_no: string | null
          reconcile_result: Json
          status: string
          sub_plan_no: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          date_from?: string | null
          date_to?: string | null
          department_id?: string | null
          doc_ref: string
          erp_hash?: string | null
          erp_last_synced_at?: string | null
          export_mode?: string
          exported_at?: string | null
          exported_by?: string | null
          exported_by_name?: string | null
          master_plan_no?: string | null
          reconcile_result?: Json
          status?: string
          sub_plan_no?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          date_from?: string | null
          date_to?: string | null
          department_id?: string | null
          doc_ref?: string
          erp_hash?: string | null
          erp_last_synced_at?: string | null
          export_mode?: string
          exported_at?: string | null
          exported_by?: string | null
          exported_by_name?: string | null
          master_plan_no?: string | null
          reconcile_result?: Json
          status?: string
          sub_plan_no?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "production_requisition_exports_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_requisition_exports_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "production_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_requisition_exports_exported_by_fkey"
            columns: ["exported_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_requisition_exports_master_plan_no_fkey"
            columns: ["master_plan_no"]
            isOneToOne: false
            referencedRelation: "production_master_plans"
            referencedColumns: ["master_plan_no"]
          },
          {
            foreignKeyName: "production_requisition_exports_sub_plan_no_fkey"
            columns: ["sub_plan_no"]
            isOneToOne: false
            referencedRelation: "production_sub_plans"
            referencedColumns: ["sub_plan_no"]
          },
          {
            foreignKeyName: "production_requisition_exports_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      production_requisition_group_batches: {
        Row: {
          can_consolidate_cross_qa: boolean
          claim_grain: string
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          created_by: string | null
          destination_note: string | null
          document_no: string | null
          export_batch_id: string | null
          exported_at: string | null
          exported_by: string | null
          group_name: string | null
          id: string
          master_plan_no: string
          metadata: Json
          status: string
          updated_at: string
        }
        Insert: {
          can_consolidate_cross_qa?: boolean
          claim_grain?: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          destination_note?: string | null
          document_no?: string | null
          export_batch_id?: string | null
          exported_at?: string | null
          exported_by?: string | null
          group_name?: string | null
          id?: string
          master_plan_no: string
          metadata?: Json
          status?: string
          updated_at?: string
        }
        Update: {
          can_consolidate_cross_qa?: boolean
          claim_grain?: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          destination_note?: string | null
          document_no?: string | null
          export_batch_id?: string | null
          exported_at?: string | null
          exported_by?: string | null
          group_name?: string | null
          id?: string
          master_plan_no?: string
          metadata?: Json
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_requisition_group_batches_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_requisition_group_batches_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_requisition_group_batches_export_batch_fkey"
            columns: ["export_batch_id"]
            isOneToOne: false
            referencedRelation: "production_requisition_export_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_requisition_group_batches_exported_by_fkey"
            columns: ["exported_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_requisition_group_batches_master_plan_no_fkey"
            columns: ["master_plan_no"]
            isOneToOne: false
            referencedRelation: "production_master_plans"
            referencedColumns: ["master_plan_no"]
          },
        ]
      }
      production_requisition_group_items: {
        Row: {
          bucket_date: string
          claim_department_id: string | null
          claim_grain: string
          created_at: string
          created_by: string | null
          group_id: string
          id: string
          issue_qty: number
          master_plan_no: string
          material_goods_code: string
          material_sku_code: string
          metadata: Json
          owner_department_id: string | null
          required_qty: number
          source_owner_department_ids: Json
          source_plan_ids: Json
          source_row_key: string
          updated_at: string
        }
        Insert: {
          bucket_date: string
          claim_department_id?: string | null
          claim_grain: string
          created_at?: string
          created_by?: string | null
          group_id: string
          id?: string
          issue_qty?: number
          master_plan_no: string
          material_goods_code: string
          material_sku_code: string
          metadata?: Json
          owner_department_id?: string | null
          required_qty?: number
          source_owner_department_ids?: Json
          source_plan_ids?: Json
          source_row_key: string
          updated_at?: string
        }
        Update: {
          bucket_date?: string
          claim_department_id?: string | null
          claim_grain?: string
          created_at?: string
          created_by?: string | null
          group_id?: string
          id?: string
          issue_qty?: number
          master_plan_no?: string
          material_goods_code?: string
          material_sku_code?: string
          metadata?: Json
          owner_department_id?: string | null
          required_qty?: number
          source_owner_department_ids?: Json
          source_plan_ids?: Json
          source_row_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_requisition_group_items_claim_department_id_fkey"
            columns: ["claim_department_id"]
            isOneToOne: false
            referencedRelation: "production_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_requisition_group_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_requisition_group_items_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "production_requisition_group_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_requisition_group_items_master_plan_no_fkey"
            columns: ["master_plan_no"]
            isOneToOne: false
            referencedRelation: "production_master_plans"
            referencedColumns: ["master_plan_no"]
          },
          {
            foreignKeyName: "production_requisition_group_items_material_sku_code_fkey"
            columns: ["material_sku_code"]
            isOneToOne: false
            referencedRelation: "products_cache"
            referencedColumns: ["sku_code"]
          },
          {
            foreignKeyName: "production_requisition_group_items_owner_department_id_fkey"
            columns: ["owner_department_id"]
            isOneToOne: false
            referencedRelation: "production_departments"
            referencedColumns: ["id"]
          },
        ]
      }
      production_requisition_preview_drafts: {
        Row: {
          created_at: string
          created_by: string | null
          date_from: string | null
          date_to: string | null
          draft_payload: Json
          id: string
          master_plan_no: string
          scope_key: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          date_from?: string | null
          date_to?: string | null
          draft_payload?: Json
          id?: string
          master_plan_no: string
          scope_key: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          date_from?: string | null
          date_to?: string | null
          draft_payload?: Json
          id?: string
          master_plan_no?: string
          scope_key?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "production_requisition_preview_drafts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_requisition_preview_drafts_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      production_routing_components: {
        Row: {
          component_sku_code: string
          component_sku_name: string
          component_type: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          department_id: string
          dispatch_split_mode: string
          fg_sku_code: string
          fg_sku_name: string
          id: string
          is_active: boolean
          issue_owner_department_id: string | null
          node_key: string
          parent_sku_code: string
          remark: string | null
          room_mode: string
          updated_at: string
          updated_by: string | null
          usage_type: string
          work_center_id: string | null
        }
        Insert: {
          component_sku_code: string
          component_sku_name: string
          component_type: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          department_id: string
          dispatch_split_mode?: string
          fg_sku_code: string
          fg_sku_name: string
          id?: string
          is_active?: boolean
          issue_owner_department_id?: string | null
          node_key: string
          parent_sku_code: string
          remark?: string | null
          room_mode?: string
          updated_at?: string
          updated_by?: string | null
          usage_type?: string
          work_center_id?: string | null
        }
        Update: {
          component_sku_code?: string
          component_sku_name?: string
          component_type?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          department_id?: string
          dispatch_split_mode?: string
          fg_sku_code?: string
          fg_sku_name?: string
          id?: string
          is_active?: boolean
          issue_owner_department_id?: string | null
          node_key?: string
          parent_sku_code?: string
          remark?: string | null
          room_mode?: string
          updated_at?: string
          updated_by?: string | null
          usage_type?: string
          work_center_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "production_routing_components_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "production_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_routing_components_issue_owner_department_id_fkey"
            columns: ["issue_owner_department_id"]
            isOneToOne: false
            referencedRelation: "production_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_routing_components_work_center_id_fkey"
            columns: ["work_center_id"]
            isOneToOne: false
            referencedRelation: "production_work_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      production_routings: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          department_id: string
          id: string
          is_active: boolean
          item_type: string
          remark: string | null
          sku_code: string
          sku_name: string
          updated_at: string
          updated_by: string | null
          work_center_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          department_id: string
          id?: string
          is_active?: boolean
          item_type: string
          remark?: string | null
          sku_code: string
          sku_name: string
          updated_at?: string
          updated_by?: string | null
          work_center_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          department_id?: string
          id?: string
          is_active?: boolean
          item_type?: string
          remark?: string | null
          sku_code?: string
          sku_name?: string
          updated_at?: string
          updated_by?: string | null
          work_center_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_routings_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "production_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_routings_work_center_id_fkey"
            columns: ["work_center_id"]
            isOneToOne: false
            referencedRelation: "production_work_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      production_schedule_column_defs: {
        Row: {
          auto_fill_field: string | null
          col_type: string
          created_at: string
          display_order: number
          group_label: string | null
          group_order: number | null
          highlight_color: string | null
          id: string
          is_required: boolean
          key: string
          label: string
          section_def_id: string
          updated_at: string
          width: number | null
        }
        Insert: {
          auto_fill_field?: string | null
          col_type?: string
          created_at?: string
          display_order?: number
          group_label?: string | null
          group_order?: number | null
          highlight_color?: string | null
          id?: string
          is_required?: boolean
          key: string
          label: string
          section_def_id: string
          updated_at?: string
          width?: number | null
        }
        Update: {
          auto_fill_field?: string | null
          col_type?: string
          created_at?: string
          display_order?: number
          group_label?: string | null
          group_order?: number | null
          highlight_color?: string | null
          id?: string
          is_required?: boolean
          key?: string
          label?: string
          section_def_id?: string
          updated_at?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "production_schedule_column_defs_section_def_id_fkey"
            columns: ["section_def_id"]
            isOneToOne: false
            referencedRelation: "production_schedule_section_defs"
            referencedColumns: ["id"]
          },
        ]
      }
      production_schedule_plans: {
        Row: {
          created_at: string
          created_by: string | null
          dept_id: string | null
          id: string
          master_plan_no: string | null
          notes: string | null
          period_end: string
          status: string
          template_id: string | null
          updated_at: string
          week_start_date: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          dept_id?: string | null
          id?: string
          master_plan_no?: string | null
          notes?: string | null
          period_end: string
          status?: string
          template_id?: string | null
          updated_at?: string
          week_start_date: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          dept_id?: string | null
          id?: string
          master_plan_no?: string | null
          notes?: string | null
          period_end?: string
          status?: string
          template_id?: string | null
          updated_at?: string
          week_start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_schedule_plans_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_schedule_plans_dept_id_fkey"
            columns: ["dept_id"]
            isOneToOne: false
            referencedRelation: "production_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_schedule_plans_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "production_schedule_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      production_schedule_rows: {
        Row: {
          created_at: string
          created_by: string | null
          day_key: string
          display_order: number
          id: string
          plan_id: string
          row_data: Json
          section_def_id: string
          sub_plan_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          day_key: string
          display_order?: number
          id?: string
          plan_id: string
          row_data?: Json
          section_def_id: string
          sub_plan_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          day_key?: string
          display_order?: number
          id?: string
          plan_id?: string
          row_data?: Json
          section_def_id?: string
          sub_plan_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_schedule_rows_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_schedule_rows_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "production_schedule_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_schedule_rows_section_def_id_fkey"
            columns: ["section_def_id"]
            isOneToOne: false
            referencedRelation: "production_schedule_section_defs"
            referencedColumns: ["id"]
          },
        ]
      }
      production_schedule_section_defs: {
        Row: {
          color_theme: string
          created_at: string
          display_order: number
          id: string
          name: string
          template_id: string
          updated_at: string
        }
        Insert: {
          color_theme?: string
          created_at?: string
          display_order?: number
          id?: string
          name: string
          template_id: string
          updated_at?: string
        }
        Update: {
          color_theme?: string
          created_at?: string
          display_order?: number
          id?: string
          name?: string
          template_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_schedule_section_defs_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "production_schedule_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      production_schedule_templates: {
        Row: {
          created_at: string
          created_by: string | null
          dept_id: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          dept_id?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          dept_id?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_schedule_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_schedule_templates_dept_id_fkey"
            columns: ["dept_id"]
            isOneToOne: false
            referencedRelation: "production_departments"
            referencedColumns: ["id"]
          },
        ]
      }
      production_section_shifts: {
        Row: {
          created_at: string
          created_by: string | null
          crosses_midnight: boolean
          deleted_at: string | null
          end_time: string
          id: string
          is_active: boolean
          section_def_id: string
          shift_id: string
          sort_order: number
          start_time: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          crosses_midnight?: boolean
          deleted_at?: string | null
          end_time: string
          id?: string
          is_active?: boolean
          section_def_id: string
          shift_id: string
          sort_order?: number
          start_time: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          crosses_midnight?: boolean
          deleted_at?: string | null
          end_time?: string
          id?: string
          is_active?: boolean
          section_def_id?: string
          shift_id?: string
          sort_order?: number
          start_time?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "production_section_shifts_section_def_id_fkey"
            columns: ["section_def_id"]
            isOneToOne: false
            referencedRelation: "production_schedule_section_defs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_section_shifts_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "production_shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      production_shifts: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          crosses_midnight: boolean
          deleted_at: string | null
          end_time: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
          start_time: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          crosses_midnight?: boolean
          deleted_at?: string | null
          end_time: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          start_time: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          crosses_midnight?: boolean
          deleted_at?: string | null
          end_time?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          start_time?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      production_snack_wage_config: {
        Row: {
          arranged_rate_per_kg: number
          created_at: string
          created_by: string | null
          id: number
          is_active: boolean
          not_arranged_rate_per_kg: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          arranged_rate_per_kg?: number
          created_at?: string
          created_by?: string | null
          id?: number
          is_active?: boolean
          not_arranged_rate_per_kg?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          arranged_rate_per_kg?: number
          created_at?: string
          created_by?: string | null
          id?: number
          is_active?: boolean
          not_arranged_rate_per_kg?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      production_snack_wage_product_mappings: {
        Row: {
          created_at: string
          created_by: string | null
          product_code: string
          updated_at: string
          updated_by: string | null
          wage_mode: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          product_code: string
          updated_at?: string
          updated_by?: string | null
          wage_mode: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          product_code?: string
          updated_at?: string
          updated_by?: string | null
          wage_mode?: string
        }
        Relationships: []
      }
      production_snack_yield_log_revisions: {
        Row: {
          action: string
          after_data: Json
          before_data: Json
          created_at: string
          edit_reason: string
          edited_by: string | null
          id: number
          log_id: string
        }
        Insert: {
          action: string
          after_data?: Json
          before_data?: Json
          created_at?: string
          edit_reason: string
          edited_by?: string | null
          id?: number
          log_id: string
        }
        Update: {
          action?: string
          after_data?: Json
          before_data?: Json
          created_at?: string
          edit_reason?: string
          edited_by?: string | null
          id?: number
          log_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_snack_yield_log_revisions_log_id_fkey"
            columns: ["log_id"]
            isOneToOne: false
            referencedRelation: "production_snack_yield_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      production_snack_yield_logs: {
        Row: {
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          doc_no: string
          doc_round: number
          doc_seq: number
          doc_status: string
          doc_year_be: number
          edit_reason: string | null
          edited_at: string | null
          edited_by: string | null
          employee_branch_snapshot: string | null
          employee_check_in_snapshot: string | null
          employee_check_out_snapshot: string | null
          employee_code: string
          employee_department_snapshot: string | null
          employee_name_snapshot: string | null
          good_kg_input: number
          id: string
          is_edited: boolean
          kg_per_case_snapshot: number
          logged_at: string
          machine_code: string
          metadata: Json
          net_cases_exact_snapshot: number
          net_cases_floor_snapshot: number
          net_cases_remainder_kg_snapshot: number
          net_kg_snapshot: number
          notes: string | null
          operator_user_id: string | null
          operator_username_snapshot: string | null
          pay_rate_per_kg_snapshot: number
          product_code_snapshot: string
          product_icdept_code_snapshot: string
          product_icdept_name_snapshot: string | null
          product_name_snapshot: string
          product_unit_snapshot: string | null
          raw_qr_payload: string | null
          remain_kg_input: number
          replaced_by_doc_no: string | null
          replaced_by_log_id: string | null
          request_id: string
          revised_from_doc_no: string | null
          revised_from_log_id: string | null
          source: string
          tin_weight_kg_snapshot: number
          tins_per_case_snapshot: number
          wage_amount_snapshot: number
          wage_mode_snapshot: string | null
          waste_kg_input: number
        }
        Insert: {
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          doc_no: string
          doc_round: number
          doc_seq: number
          doc_status?: string
          doc_year_be: number
          edit_reason?: string | null
          edited_at?: string | null
          edited_by?: string | null
          employee_branch_snapshot?: string | null
          employee_check_in_snapshot?: string | null
          employee_check_out_snapshot?: string | null
          employee_code: string
          employee_department_snapshot?: string | null
          employee_name_snapshot?: string | null
          good_kg_input: number
          id?: string
          is_edited?: boolean
          kg_per_case_snapshot?: number
          logged_at?: string
          machine_code: string
          metadata?: Json
          net_cases_exact_snapshot?: number
          net_cases_floor_snapshot?: number
          net_cases_remainder_kg_snapshot?: number
          net_kg_snapshot: number
          notes?: string | null
          operator_user_id?: string | null
          operator_username_snapshot?: string | null
          pay_rate_per_kg_snapshot?: number
          product_code_snapshot: string
          product_icdept_code_snapshot: string
          product_icdept_name_snapshot?: string | null
          product_name_snapshot: string
          product_unit_snapshot?: string | null
          raw_qr_payload?: string | null
          remain_kg_input: number
          replaced_by_doc_no?: string | null
          replaced_by_log_id?: string | null
          request_id: string
          revised_from_doc_no?: string | null
          revised_from_log_id?: string | null
          source?: string
          tin_weight_kg_snapshot?: number
          tins_per_case_snapshot?: number
          wage_amount_snapshot?: number
          wage_mode_snapshot?: string | null
          waste_kg_input: number
        }
        Update: {
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          doc_no?: string
          doc_round?: number
          doc_seq?: number
          doc_status?: string
          doc_year_be?: number
          edit_reason?: string | null
          edited_at?: string | null
          edited_by?: string | null
          employee_branch_snapshot?: string | null
          employee_check_in_snapshot?: string | null
          employee_check_out_snapshot?: string | null
          employee_code?: string
          employee_department_snapshot?: string | null
          employee_name_snapshot?: string | null
          good_kg_input?: number
          id?: string
          is_edited?: boolean
          kg_per_case_snapshot?: number
          logged_at?: string
          machine_code?: string
          metadata?: Json
          net_cases_exact_snapshot?: number
          net_cases_floor_snapshot?: number
          net_cases_remainder_kg_snapshot?: number
          net_kg_snapshot?: number
          notes?: string | null
          operator_user_id?: string | null
          operator_username_snapshot?: string | null
          pay_rate_per_kg_snapshot?: number
          product_code_snapshot?: string
          product_icdept_code_snapshot?: string
          product_icdept_name_snapshot?: string | null
          product_name_snapshot?: string
          product_unit_snapshot?: string | null
          raw_qr_payload?: string | null
          remain_kg_input?: number
          replaced_by_doc_no?: string | null
          replaced_by_log_id?: string | null
          request_id?: string
          revised_from_doc_no?: string | null
          revised_from_log_id?: string | null
          source?: string
          tin_weight_kg_snapshot?: number
          tins_per_case_snapshot?: number
          wage_amount_snapshot?: number
          wage_mode_snapshot?: string | null
          waste_kg_input?: number
        }
        Relationships: [
          {
            foreignKeyName: "production_snack_yield_logs_replaced_by_log_id_fkey"
            columns: ["replaced_by_log_id"]
            isOneToOne: false
            referencedRelation: "production_snack_yield_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_snack_yield_logs_revised_from_log_id_fkey"
            columns: ["revised_from_log_id"]
            isOneToOne: false
            referencedRelation: "production_snack_yield_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      production_stock_issue_documents: {
        Row: {
          created_at: string
          created_by: string | null
          department_code: string
          department_id: string
          id: string
          issue_date: string
          issue_no: string
          issue_type: string
          issued_at: string
          metadata: Json
          remark: string | null
          status: string
          updated_at: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          department_code: string
          department_id: string
          id?: string
          issue_date: string
          issue_no: string
          issue_type: string
          issued_at?: string
          metadata?: Json
          remark?: string | null
          status?: string
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          department_code?: string
          department_id?: string
          id?: string
          issue_date?: string
          issue_no?: string
          issue_type?: string
          issued_at?: string
          metadata?: Json
          remark?: string | null
          status?: string
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "production_stock_issue_documents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_stock_issue_documents_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "production_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_stock_issue_documents_voided_by_fkey"
            columns: ["voided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      production_stock_issue_items: {
        Row: {
          barcode: string
          category_code: string
          created_at: string
          created_by: string | null
          id: string
          issue_document_id: string
          issued_at: string
          lot_no: string
          metadata: Json
          product_code: string
          product_name_snapshot: string
          quantity: number
          source_receipt_id: string
          status: string
          uom_name: string | null
          updated_at: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
          weight_kg: number
        }
        Insert: {
          barcode: string
          category_code?: string
          created_at?: string
          created_by?: string | null
          id?: string
          issue_document_id: string
          issued_at?: string
          lot_no: string
          metadata?: Json
          product_code: string
          product_name_snapshot: string
          quantity?: number
          source_receipt_id: string
          status?: string
          uom_name?: string | null
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
          weight_kg?: number
        }
        Update: {
          barcode?: string
          category_code?: string
          created_at?: string
          created_by?: string | null
          id?: string
          issue_document_id?: string
          issued_at?: string
          lot_no?: string
          metadata?: Json
          product_code?: string
          product_name_snapshot?: string
          quantity?: number
          source_receipt_id?: string
          status?: string
          uom_name?: string | null
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
          weight_kg?: number
        }
        Relationships: [
          {
            foreignKeyName: "production_stock_issue_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_stock_issue_items_issue_document_id_fkey"
            columns: ["issue_document_id"]
            isOneToOne: false
            referencedRelation: "production_prison_inbound_report_lines_v"
            referencedColumns: ["inbound_document_id"]
          },
          {
            foreignKeyName: "production_stock_issue_items_issue_document_id_fkey"
            columns: ["issue_document_id"]
            isOneToOne: false
            referencedRelation: "production_stock_issue_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_stock_issue_items_issue_document_id_fkey"
            columns: ["issue_document_id"]
            isOneToOne: false
            referencedRelation: "production_stock_issue_report_lines_v"
            referencedColumns: ["issue_document_id"]
          },
          {
            foreignKeyName: "production_stock_issue_items_product_code_fkey"
            columns: ["product_code"]
            isOneToOne: false
            referencedRelation: "products_cache"
            referencedColumns: ["sku_code"]
          },
          {
            foreignKeyName: "production_stock_issue_items_source_receipt_id_fkey"
            columns: ["source_receipt_id"]
            isOneToOne: false
            referencedRelation: "production_weight_receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_stock_issue_items_voided_by_fkey"
            columns: ["voided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      production_stock_movements: {
        Row: {
          category_code: string
          created_at: string
          created_by: string | null
          department_code: string
          department_id: string
          id: string
          lot_no: string
          metadata: Json
          movement_at: string
          movement_date: string
          movement_no: string
          movement_type: string
          product_code: string
          product_name_snapshot: string
          quantity_in: number
          quantity_out: number
          reference_no: string | null
          reference_type: string | null
          remark: string | null
          source_document_no: string | null
          source_document_type: string | null
          uom_name: string | null
          updated_at: string
          weight_in_kg: number
          weight_out_kg: number
        }
        Insert: {
          category_code?: string
          created_at?: string
          created_by?: string | null
          department_code: string
          department_id: string
          id?: string
          lot_no: string
          metadata?: Json
          movement_at?: string
          movement_date: string
          movement_no: string
          movement_type: string
          product_code: string
          product_name_snapshot: string
          quantity_in?: number
          quantity_out?: number
          reference_no?: string | null
          reference_type?: string | null
          remark?: string | null
          source_document_no?: string | null
          source_document_type?: string | null
          uom_name?: string | null
          updated_at?: string
          weight_in_kg?: number
          weight_out_kg?: number
        }
        Update: {
          category_code?: string
          created_at?: string
          created_by?: string | null
          department_code?: string
          department_id?: string
          id?: string
          lot_no?: string
          metadata?: Json
          movement_at?: string
          movement_date?: string
          movement_no?: string
          movement_type?: string
          product_code?: string
          product_name_snapshot?: string
          quantity_in?: number
          quantity_out?: number
          reference_no?: string | null
          reference_type?: string | null
          remark?: string | null
          source_document_no?: string | null
          source_document_type?: string | null
          uom_name?: string | null
          updated_at?: string
          weight_in_kg?: number
          weight_out_kg?: number
        }
        Relationships: [
          {
            foreignKeyName: "production_stock_movements_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "production_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_stock_movements_product_code_fkey"
            columns: ["product_code"]
            isOneToOne: false
            referencedRelation: "products_cache"
            referencedColumns: ["sku_code"]
          },
        ]
      }
      production_stock_opening_balances: {
        Row: {
          balance_date: string
          category_code: string
          created_at: string
          created_by: string | null
          department_code: string
          department_id: string
          id: string
          import_batch_no: string | null
          lot_no: string
          metadata: Json
          product_code: string
          product_name_snapshot: string
          quantity: number
          remark: string | null
          source: string
          uom_name: string | null
          updated_at: string
          weight_kg: number
        }
        Insert: {
          balance_date: string
          category_code?: string
          created_at?: string
          created_by?: string | null
          department_code: string
          department_id: string
          id?: string
          import_batch_no?: string | null
          lot_no: string
          metadata?: Json
          product_code: string
          product_name_snapshot: string
          quantity?: number
          remark?: string | null
          source?: string
          uom_name?: string | null
          updated_at?: string
          weight_kg?: number
        }
        Update: {
          balance_date?: string
          category_code?: string
          created_at?: string
          created_by?: string | null
          department_code?: string
          department_id?: string
          id?: string
          import_batch_no?: string | null
          lot_no?: string
          metadata?: Json
          product_code?: string
          product_name_snapshot?: string
          quantity?: number
          remark?: string | null
          source?: string
          uom_name?: string | null
          updated_at?: string
          weight_kg?: number
        }
        Relationships: [
          {
            foreignKeyName: "production_stock_opening_balances_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "production_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_stock_opening_balances_product_code_fkey"
            columns: ["product_code"]
            isOneToOne: false
            referencedRelation: "products_cache"
            referencedColumns: ["sku_code"]
          },
        ]
      }
      production_sub_plans: {
        Row: {
          confirmed_at: string | null
          confirmed_by: string | null
          confirmed_by_name: string | null
          created_at: string
          created_by: string | null
          department_id: string
          id: number
          master_plan_no: string
          note: string | null
          status: string
          sub_plan_no: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          confirmed_by_name?: string | null
          created_at?: string
          created_by?: string | null
          department_id: string
          id?: number
          master_plan_no: string
          note?: string | null
          status?: string
          sub_plan_no: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          confirmed_by_name?: string | null
          created_at?: string
          created_by?: string | null
          department_id?: string
          id?: number
          master_plan_no?: string
          note?: string | null
          status?: string
          sub_plan_no?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "production_sub_plans_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_sub_plans_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_sub_plans_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "production_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_sub_plans_master_plan_no_fkey"
            columns: ["master_plan_no"]
            isOneToOne: false
            referencedRelation: "production_master_plans"
            referencedColumns: ["master_plan_no"]
          },
          {
            foreignKeyName: "production_sub_plans_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      production_weight_receipts: {
        Row: {
          amount_per_pallet: number | null
          barcode: string | null
          created_at: string
          gross_weight_kg: number
          id: string
          lot_id: string
          metadata: Json
          net_weight_kg: number
          pass_weight_kg: number | null
          product_config_id: string
          status: string
          tare_weight_kg: number
          weighed_at: string
          weighed_by: string | null
        }
        Insert: {
          amount_per_pallet?: number | null
          barcode?: string | null
          created_at?: string
          gross_weight_kg: number
          id?: string
          lot_id: string
          metadata?: Json
          net_weight_kg: number
          pass_weight_kg?: number | null
          product_config_id: string
          status?: string
          tare_weight_kg: number
          weighed_at?: string
          weighed_by?: string | null
        }
        Update: {
          amount_per_pallet?: number | null
          barcode?: string | null
          created_at?: string
          gross_weight_kg?: number
          id?: string
          lot_id?: string
          metadata?: Json
          net_weight_kg?: number
          pass_weight_kg?: number | null
          product_config_id?: string
          status?: string
          tare_weight_kg?: number
          weighed_at?: string
          weighed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "production_weight_receipts_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "production_weight_scale_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_weight_receipts_product_config_id_fkey"
            columns: ["product_config_id"]
            isOneToOne: false
            referencedRelation: "production_weight_scale_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_weight_receipts_weighed_by_fkey"
            columns: ["weighed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      production_weight_scale_lots: {
        Row: {
          closed_at: string | null
          created_at: string
          id: string
          lot_code: string
          opened_at: string
          product_config_id: string
          status: string
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          id?: string
          lot_code: string
          opened_at?: string
          product_config_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          id?: string
          lot_code?: string
          opened_at?: string
          product_config_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_weight_scale_lots_product_config_id_fkey"
            columns: ["product_config_id"]
            isOneToOne: false
            referencedRelation: "production_weight_scale_products"
            referencedColumns: ["id"]
          },
        ]
      }
      production_weight_scale_products: {
        Row: {
          amount_per_pallet: number | null
          created_at: string
          current_lot_id: string | null
          department_id: string
          id: string
          is_active: boolean
          lot_format: string | null
          pass_weight_kg: number | null
          sku_code: string
          tare_weight_kg: number | null
          updated_at: string
        }
        Insert: {
          amount_per_pallet?: number | null
          created_at?: string
          current_lot_id?: string | null
          department_id: string
          id?: string
          is_active?: boolean
          lot_format?: string | null
          pass_weight_kg?: number | null
          sku_code: string
          tare_weight_kg?: number | null
          updated_at?: string
        }
        Update: {
          amount_per_pallet?: number | null
          created_at?: string
          current_lot_id?: string | null
          department_id?: string
          id?: string
          is_active?: boolean
          lot_format?: string | null
          pass_weight_kg?: number | null
          sku_code?: string
          tare_weight_kg?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_weight_scale_products_current_lot_fkey"
            columns: ["current_lot_id", "id"]
            isOneToOne: false
            referencedRelation: "production_weight_scale_lots"
            referencedColumns: ["id", "product_config_id"]
          },
          {
            foreignKeyName: "production_weight_scale_products_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "production_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_weight_scale_products_sku_code_fkey"
            columns: ["sku_code"]
            isOneToOne: false
            referencedRelation: "products_cache"
            referencedColumns: ["sku_code"]
          },
        ]
      }
      production_wip_policies: {
        Row: {
          allow_master_plan: boolean
          created_at: string
          created_by: string | null
          is_active: boolean
          note: string | null
          sku_code: string
          supply_mode: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          allow_master_plan?: boolean
          created_at?: string
          created_by?: string | null
          is_active?: boolean
          note?: string | null
          sku_code: string
          supply_mode?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          allow_master_plan?: boolean
          created_at?: string
          created_by?: string | null
          is_active?: boolean
          note?: string | null
          sku_code?: string
          supply_mode?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "production_wip_policies_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_wip_policies_sku_code_fkey"
            columns: ["sku_code"]
            isOneToOne: true
            referencedRelation: "products_cache"
            referencedColumns: ["sku_code"]
          },
          {
            foreignKeyName: "production_wip_policies_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      production_work_centers: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          delivery_point_id: string | null
          department_id: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          delivery_point_id?: string | null
          department_id: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          delivery_point_id?: string | null
          department_id?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "production_work_centers_delivery_point_id_fkey"
            columns: ["delivery_point_id"]
            isOneToOne: false
            referencedRelation: "production_delivery_points"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_work_centers_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "production_departments"
            referencedColumns: ["id"]
          },
        ]
      }
      production_work_type_choice_options: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          field_key: string
          id: number
          is_active: boolean
          option_label: string | null
          option_value: string
          sort_order: number
          updated_at: string
          updated_by: string | null
          work_type_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          field_key: string
          id?: number
          is_active?: boolean
          option_label?: string | null
          option_value: string
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
          work_type_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          field_key?: string
          id?: number
          is_active?: boolean
          option_label?: string | null
          option_value?: string
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
          work_type_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_work_type_choice_options_work_type_id_fkey"
            columns: ["work_type_id"]
            isOneToOne: false
            referencedRelation: "production_work_types"
            referencedColumns: ["id"]
          },
        ]
      }
      production_work_type_conversion_rules: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          filling_value: string | null
          id: number
          is_active: boolean
          kg_per_unit: number
          size_value: string | null
          sort_order: number
          updated_at: string
          updated_by: string | null
          work_type_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          filling_value?: string | null
          id?: number
          is_active?: boolean
          kg_per_unit: number
          size_value?: string | null
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
          work_type_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          filling_value?: string | null
          id?: number
          is_active?: boolean
          kg_per_unit?: number
          size_value?: string | null
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
          work_type_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_work_type_conversion_rules_work_type_id_fkey"
            columns: ["work_type_id"]
            isOneToOne: false
            referencedRelation: "production_work_types"
            referencedColumns: ["id"]
          },
        ]
      }
      production_work_type_size_filling_mappings: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          filling_value: string
          id: number
          is_active: boolean
          size_value: string | null
          sort_order: number
          updated_at: string
          updated_by: string | null
          work_type_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          filling_value: string
          id?: number
          is_active?: boolean
          size_value?: string | null
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
          work_type_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          filling_value?: string
          id?: number
          is_active?: boolean
          size_value?: string | null
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
          work_type_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_work_type_size_filling_mappings_work_type_id_fkey"
            columns: ["work_type_id"]
            isOneToOne: false
            referencedRelation: "production_work_types"
            referencedColumns: ["id"]
          },
        ]
      }
      production_work_types: {
        Row: {
          code: string
          conversion_mode: string
          created_at: string
          created_by: string | null
          default_decimal_scale: number
          default_kg_per_unit: number | null
          default_unit_label: string
          default_value_kind: string
          default_value_label: string
          deleted_at: string | null
          deleted_by: string | null
          department_id: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          pay_rate_per_kg: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          code: string
          conversion_mode?: string
          created_at?: string
          created_by?: string | null
          default_decimal_scale?: number
          default_kg_per_unit?: number | null
          default_unit_label?: string
          default_value_kind?: string
          default_value_label?: string
          deleted_at?: string | null
          deleted_by?: string | null
          department_id: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          pay_rate_per_kg?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          code?: string
          conversion_mode?: string
          created_at?: string
          created_by?: string | null
          default_decimal_scale?: number
          default_kg_per_unit?: number | null
          default_unit_label?: string
          default_value_kind?: string
          default_value_label?: string
          deleted_at?: string | null
          deleted_by?: string | null
          department_id?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          pay_rate_per_kg?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "production_work_types_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "production_departments"
            referencedColumns: ["id"]
          },
        ]
      }
      products_cache: {
        Row: {
          brand_code: string | null
          brand_name: string | null
          iccat_code: string
          iccat_name: string | null
          icdept_code: string | null
          icdept_name: string | null
          image_url: string | null
          is_active: boolean
          sku_code: string
          sku_name: string
          source_updated_at: string | null
          uom_name: string | null
          updated_at: string
        }
        Insert: {
          brand_code?: string | null
          brand_name?: string | null
          iccat_code: string
          iccat_name?: string | null
          icdept_code?: string | null
          icdept_name?: string | null
          image_url?: string | null
          is_active?: boolean
          sku_code: string
          sku_name: string
          source_updated_at?: string | null
          uom_name?: string | null
          updated_at?: string
        }
        Update: {
          brand_code?: string | null
          brand_name?: string | null
          iccat_code?: string
          iccat_name?: string | null
          icdept_code?: string | null
          icdept_name?: string | null
          image_url?: string | null
          is_active?: boolean
          sku_code?: string
          sku_name?: string
          source_updated_at?: string | null
          uom_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          approver_code: string | null
          approver_code_active: boolean
          archive_reason: string | null
          archived_at: string | null
          archived_by: string | null
          created_at: string
          created_by: string | null
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          department_id: string | null
          id: string
          is_active: boolean
          is_archived: boolean
          line_link_code: string | null
          line_linked_at: string | null
          line_user_id: string | null
          updated_at: string
          updated_by: string | null
          username: string
        }
        Insert: {
          approver_code?: string | null
          approver_code_active?: boolean
          archive_reason?: string | null
          archived_at?: string | null
          archived_by?: string | null
          created_at?: string
          created_by?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          department_id?: string | null
          id: string
          is_active?: boolean
          is_archived?: boolean
          line_link_code?: string | null
          line_linked_at?: string | null
          line_user_id?: string | null
          updated_at?: string
          updated_by?: string | null
          username: string
        }
        Update: {
          approver_code?: string | null
          approver_code_active?: boolean
          archive_reason?: string | null
          archived_at?: string | null
          archived_by?: string | null
          created_at?: string
          created_by?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          department_id?: string | null
          id?: string
          is_active?: boolean
          is_archived?: boolean
          line_link_code?: string | null
          line_linked_at?: string | null
          line_user_id?: string | null
          updated_at?: string
          updated_by?: string | null
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          created_at: string
          created_by: string | null
          permission_id: string
          role_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          permission_id: string
          role_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          permission_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_system: boolean
          name: string
          role_key: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_system?: boolean
          name: string
          role_key: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_system?: boolean
          name?: string
          role_key?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          created_at: string
          setting_key: string
          setting_value: Json
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          setting_key: string
          setting_value?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          setting_key?: string
          setting_value?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "system_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          created_by: string | null
          is_primary: boolean
          role_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          is_primary?: boolean
          role_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          is_primary?: boolean
          role_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_sessions: {
        Row: {
          created_at: string
          id: string
          ip_address: string | null
          last_seen_at: string
          revoked_at: string | null
          session_id: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          ip_address?: string | null
          last_seen_at?: string
          revoked_at?: string | null
          session_id: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          ip_address?: string | null
          last_seen_at?: string
          revoked_at?: string | null
          session_id?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      web_push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          enabled: boolean
          endpoint: string
          event_types: string[]
          id: string
          last_error: string | null
          last_seen_at: string | null
          p256dh: string
          revoked_at: string | null
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          enabled?: boolean
          endpoint: string
          event_types?: string[]
          id?: string
          last_error?: string | null
          last_seen_at?: string | null
          p256dh: string
          revoked_at?: string | null
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          enabled?: boolean
          endpoint?: string
          event_types?: string[]
          id?: string
          last_error?: string | null
          last_seen_at?: string | null
          p256dh?: string
          revoked_at?: string | null
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "web_push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      production_prison_inbound_report_lines_v: {
        Row: {
          barcode: string | null
          category_code: string | null
          department_code: string | null
          department_id: string | null
          inbound_date: string | null
          inbound_document_id: string | null
          inbound_document_issued_at: string | null
          inbound_document_status: string | null
          inbound_item_id: string | null
          inbound_item_status: string | null
          inbound_no: string | null
          lot_no: string | null
          prison_document_status: string | null
          prison_issue_date: string | null
          prison_issue_document_id: string | null
          prison_issue_item_id: string | null
          prison_issue_no: string | null
          prison_issued_at: string | null
          prison_item_status: string | null
          product_code: string | null
          product_name_snapshot: string | null
          quantity: number | null
          uom_name: string | null
          weight_kg: number | null
        }
        Relationships: [
          {
            foreignKeyName: "production_stock_issue_documents_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "production_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_stock_issue_items_product_code_fkey"
            columns: ["product_code"]
            isOneToOne: false
            referencedRelation: "products_cache"
            referencedColumns: ["sku_code"]
          },
        ]
      }
      production_prison_issue_report_lines_v: {
        Row: {
          barcode: string | null
          category_code: string | null
          created_at: string | null
          department_code: string | null
          department_id: string | null
          document_issued_at: string | null
          document_remark: string | null
          document_status: string | null
          issue_date: string | null
          issued_at: string | null
          item_status: string | null
          lot_no: string | null
          prison_issue_document_id: string | null
          prison_issue_item_id: string | null
          prison_issue_no: string | null
          product_code: string | null
          product_name_snapshot: string | null
          quantity: number | null
          source_issue_document_id: string | null
          source_issue_item_id: string | null
          source_receipt_id: string | null
          uom_name: string | null
          void_reason: string | null
          voided_at: string | null
          weight_kg: number | null
        }
        Relationships: [
          {
            foreignKeyName: "production_prison_issue_documents_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "production_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_prison_issue_items_product_code_fkey"
            columns: ["product_code"]
            isOneToOne: false
            referencedRelation: "products_cache"
            referencedColumns: ["sku_code"]
          },
          {
            foreignKeyName: "production_prison_issue_items_source_issue_document_id_fkey"
            columns: ["source_issue_document_id"]
            isOneToOne: false
            referencedRelation: "production_prison_inbound_report_lines_v"
            referencedColumns: ["inbound_document_id"]
          },
          {
            foreignKeyName: "production_prison_issue_items_source_issue_document_id_fkey"
            columns: ["source_issue_document_id"]
            isOneToOne: false
            referencedRelation: "production_stock_issue_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_prison_issue_items_source_issue_document_id_fkey"
            columns: ["source_issue_document_id"]
            isOneToOne: false
            referencedRelation: "production_stock_issue_report_lines_v"
            referencedColumns: ["issue_document_id"]
          },
          {
            foreignKeyName: "production_prison_issue_items_source_issue_item_id_fkey"
            columns: ["source_issue_item_id"]
            isOneToOne: false
            referencedRelation: "production_prison_inbound_report_lines_v"
            referencedColumns: ["inbound_item_id"]
          },
          {
            foreignKeyName: "production_prison_issue_items_source_issue_item_id_fkey"
            columns: ["source_issue_item_id"]
            isOneToOne: false
            referencedRelation: "production_stock_issue_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_prison_issue_items_source_issue_item_id_fkey"
            columns: ["source_issue_item_id"]
            isOneToOne: false
            referencedRelation: "production_stock_issue_report_lines_v"
            referencedColumns: ["issue_item_id"]
          },
          {
            foreignKeyName: "production_prison_issue_items_source_issue_item_id_fkey"
            columns: ["source_issue_item_id"]
            isOneToOne: false
            referencedRelation: "production_stock_issue_usage_progress_v"
            referencedColumns: ["source_issue_item_id"]
          },
          {
            foreignKeyName: "production_prison_issue_items_source_receipt_id_fkey"
            columns: ["source_receipt_id"]
            isOneToOne: false
            referencedRelation: "production_weight_receipts"
            referencedColumns: ["id"]
          },
        ]
      }
      production_stock_balances_v: {
        Row: {
          actual_use_quantity: number | null
          actual_use_weight_kg: number | null
          adjustment_in_quantity: number | null
          adjustment_in_weight_kg: number | null
          adjustment_out_quantity: number | null
          adjustment_out_weight_kg: number | null
          category_code: string | null
          current_quantity: number | null
          current_weight_kg: number | null
          department_code: string | null
          department_id: string | null
          issue_quantity: number | null
          issue_weight_kg: number | null
          lot_no: string | null
          opening_quantity: number | null
          opening_weight_kg: number | null
          product_code: string | null
          product_name_snapshot: string | null
          receipt_quantity: number | null
          receipt_weight_kg: number | null
          return_quantity: number | null
          return_weight_kg: number | null
        }
        Relationships: []
      }
      production_stock_issue_report_lines_v: {
        Row: {
          barcode: string | null
          category_code: string | null
          created_at: string | null
          department_code: string | null
          department_id: string | null
          document_issued_at: string | null
          document_remark: string | null
          document_status: string | null
          issue_date: string | null
          issue_document_id: string | null
          issue_item_id: string | null
          issue_no: string | null
          issue_type: string | null
          issued_at: string | null
          item_status: string | null
          lot_no: string | null
          product_code: string | null
          product_name_snapshot: string | null
          quantity: number | null
          source_receipt_id: string | null
          uom_name: string | null
          void_reason: string | null
          voided_at: string | null
          weight_kg: number | null
        }
        Relationships: [
          {
            foreignKeyName: "production_stock_issue_documents_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "production_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_stock_issue_items_product_code_fkey"
            columns: ["product_code"]
            isOneToOne: false
            referencedRelation: "products_cache"
            referencedColumns: ["sku_code"]
          },
          {
            foreignKeyName: "production_stock_issue_items_source_receipt_id_fkey"
            columns: ["source_receipt_id"]
            isOneToOne: false
            referencedRelation: "production_weight_receipts"
            referencedColumns: ["id"]
          },
        ]
      }
      production_stock_issue_usage_progress_v: {
        Row: {
          last_returned_at: string | null
          last_wasted_at: string | null
          remaining_weight_kg: number | null
          return_count: number | null
          returned_quantity: number | null
          returned_weight_kg: number | null
          source_issue_item_id: string | null
          waste_count: number | null
          wasted_quantity: number | null
          wasted_weight_kg: number | null
        }
        Relationships: []
      }
      production_stock_return_progress_v: {
        Row: {
          last_returned_at: string | null
          return_count: number | null
          returned_quantity: number | null
          returned_weight_kg: number | null
          source_issue_item_id: string | null
        }
        Relationships: []
      }
      production_stock_waste_progress_v: {
        Row: {
          last_wasted_at: string | null
          source_issue_item_id: string | null
          waste_count: number | null
          wasted_quantity: number | null
          wasted_weight_kg: number | null
        }
        Relationships: []
      }
      vw_issued_materials: {
        Row: {
          issued_qty: number | null
          material_sku_code: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      allocate_erp_export_document_numbers: {
        Args: { p_document_dates: string[]; p_document_type: string }
        Returns: {
          document_date: string
          document_no: string
          period_ym: string
          running_no: number
        }[]
      }
      allocate_requisition_document_numbers: {
        Args: { requested_at?: string; requested_count?: number }
        Returns: {
          document_no: string
          sequence_key: string
          sequence_value: number
        }[]
      }
      can_act_on_claim_department: {
        Args: { p_department_id: string; p_required_permission?: string }
        Returns: boolean
      }
      cancel_production_prison_inbound_item: {
        Args: {
          p_actor_user_id?: string
          p_source_issue_item_id: string
          p_void_reason?: string
        }
        Returns: Json
      }
      cancel_production_prison_issue_item: {
        Args: {
          p_actor_user_id?: string
          p_prison_issue_item_id: string
          p_void_reason?: string
        }
        Returns: Json
      }
      cancel_production_stock_issue_item: {
        Args: {
          p_actor_user_id?: string
          p_issue_item_id: string
          p_void_reason?: string
        }
        Returns: Json
      }
      create_production_prison_issue: {
        Args: {
          p_actor_user_id?: string
          p_barcode: string
          p_issued_at?: string
          p_remark?: string
        }
        Returns: Json
      }
      create_production_stock_issue: {
        Args: {
          p_actor_user_id?: string
          p_barcode: string
          p_issue_type: string
          p_remark?: string
        }
        Returns: Json
      }
      create_production_stock_return:
        | {
            Args: {
              p_actor_user_id?: string
              p_gross_weight_kg: number
              p_remark?: string
              p_source_barcode: string
              p_tare_source?: string
              p_tare_weight_kg: number
            }
            Returns: Json
          }
        | {
            Args: {
              p_actor_user_id?: string
              p_net_weight_kg: number
              p_remark?: string
              p_source_barcode: string
            }
            Returns: Json
          }
      create_production_stock_waste: {
        Args: {
          p_actor_user_id?: string
          p_remark?: string
          p_source_barcode: string
          p_waste_weight_kg: number
        }
        Returns: Json
      }
      explode_bom_batch: {
        Args: { p_max_depth?: number; p_plan_items: Json }
        Returns: {
          explosion_rows: number
          has_cycle: boolean
          issue_qty: number
          item_type: string
          material_goods_code: string
          material_name: string
          material_sku_code: string
          max_depth: number
          plan_id: string
          required_qty: number
          root_sku_code: string
          uom_name: string
        }[]
      }
      explode_bom_batch_with_planning_offsets: {
        Args: { p_max_depth?: number; p_plan_items: Json }
        Returns: {
          explosion_rows: number
          has_cycle: boolean
          issue_qty: number
          item_type: string
          material_goods_code: string
          material_name: string
          material_sku_code: string
          max_depth: number
          plan_id: string
          planning_offset_days: number
          required_qty: number
          root_sku_code: string
          uom_name: string
        }[]
      }
      explode_bom_trace_batch: {
        Args: { p_max_depth?: number; p_plan_items: Json }
        Returns: {
          base_batch: number
          bom_version_id: string
          bom_version_no: number
          child_item_type: string
          child_material_goods_code: string
          child_material_name: string
          child_required_qty: number
          child_sku_code: string
          component_qty: number
          depth: number
          formula_code: string
          formula_name: string
          is_cycle: boolean
          parent_material_name: string
          parent_required_qty: number
          parent_sku_code: string
          path: string[]
          plan_id: string
          root_sku_code: string
          uom_name: string
        }[]
      }
      generate_production_stock_reference_no: {
        Args: { prefix: string }
        Returns: string
      }
      has_permission: { Args: { perm_key: string }; Returns: boolean }
      insert_piece_rate_log_safely: {
        Args: {
          p_captured_at: string
          p_duplicate_window_seconds?: number
          p_employee_code: string
          p_input_value: number
          p_machine_code: string
          p_payload: Json
          p_product_barcode: string
          p_source: string
          p_weight_tolerance?: number
        }
        Returns: Json
      }
      is_admin: { Args: never; Returns: boolean }
      is_bom_matrix_allowed: {
        Args: { child_type: string; parent_type: string }
        Returns: boolean
      }
      issue_production_report_doc_number: {
        Args: {
          p_actor_user_id?: string
          p_date_from: string
          p_date_to: string
          p_metadata?: Json
          p_report_type: string
          p_request_id?: string
          p_scope_hash: string
          p_snapshot_hash: string
          p_view_mode: string
        }
        Returns: Json
      }
      next_production_daily_work_doc_number: {
        Args: {
          p_actor_user_id?: string
          p_machine_code: string
          p_metadata?: Json
          p_request_id?: string
          p_source?: string
          p_year_be: number
        }
        Returns: Json
      }
      next_production_daily_work_doc_seq: {
        Args: { p_machine_code: string; p_year_be: number }
        Returns: number
      }
      resolve_bom_item_type: { Args: { iccat_code: string }; Returns: string }
      try_parse_timestamptz: { Args: { value: string }; Returns: string }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const

