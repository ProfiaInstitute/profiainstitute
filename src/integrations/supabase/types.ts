export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type TableShape<Row, Insert, Update = Partial<Insert>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18";
  };
  public: {
    Tables: {
      academic_years: {
        Row: {
          created_at: string;
          id: string;
          is_current: boolean;
          name: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          is_current?: boolean;
          name: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_current?: boolean;
          name?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      announcements: {
        Row: {
          attachment_type: string | null;
          attachment_file_name: string | null;
          attachment_url: string | null;
          body: string;
          category: string;
          cta_label: string | null;
          cta_url: string | null;
          created_at: string;
          created_by: string | null;
          ends_at: string | null;
          id: string;
          published: boolean;
          show_on_homepage: boolean;
          show_public: boolean;
          show_to_students: boolean;
          show_to_facilitators: boolean;
          starts_at: string | null;
          title: string;
          updated_at: string;
        };
        Insert: {
          attachment_type?: string | null;
          attachment_file_name?: string | null;
          attachment_url?: string | null;
          body?: string;
          category?: string;
          cta_label?: string | null;
          cta_url?: string | null;
          created_at?: string;
          created_by?: string | null;
          ends_at?: string | null;
          id?: string;
          published?: boolean;
          show_on_homepage?: boolean;
          show_public?: boolean;
          show_to_students?: boolean;
          show_to_facilitators?: boolean;
          starts_at?: string | null;
          title: string;
          updated_at?: string;
        };
        Update: {
          attachment_type?: string | null;
          attachment_file_name?: string | null;
          attachment_url?: string | null;
          body?: string;
          category?: string;
          cta_label?: string | null;
          cta_url?: string | null;
          created_at?: string;
          created_by?: string | null;
          ends_at?: string | null;
          id?: string;
          published?: boolean;
          show_on_homepage?: boolean;
          show_public?: boolean;
          show_to_students?: boolean;
          show_to_facilitators?: boolean;
          starts_at?: string | null;
          title?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      application_documents: {
        Row: {
          application_id: string;
          created_at: string;
          doc_type: string;
          file_name: string | null;
          file_path: string;
          id: string;
        };
        Insert: {
          application_id: string;
          created_at?: string;
          doc_type: string;
          file_name?: string | null;
          file_path: string;
          id?: string;
        };
        Update: {
          application_id?: string;
          created_at?: string;
          doc_type?: string;
          file_name?: string | null;
          file_path?: string;
          id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "application_documents_application_id_fkey";
            columns: ["application_id"];
            isOneToOne: false;
            referencedRelation: "applications";
            referencedColumns: ["id"];
          },
        ];
      };
      application_notes: {
        Row: {
          application_id: string;
          author_id: string | null;
          created_at: string;
          id: string;
          note: string;
        };
        Insert: {
          application_id: string;
          author_id?: string | null;
          created_at?: string;
          id?: string;
          note: string;
        };
        Update: {
          application_id?: string;
          author_id?: string | null;
          created_at?: string;
          id?: string;
          note?: string;
        };
        Relationships: [
          {
            foreignKeyName: "application_notes_application_id_fkey";
            columns: ["application_id"];
            isOneToOne: false;
            referencedRelation: "applications";
            referencedColumns: ["id"];
          },
        ];
      };
      application_status_history: {
        Row: {
          application_id: string;
          changed_by: string | null;
          created_at: string;
          from_status: Database["public"]["Enums"]["application_status"] | null;
          id: string;
          note: string | null;
          to_status: Database["public"]["Enums"]["application_status"];
        };
        Insert: {
          application_id: string;
          changed_by?: string | null;
          created_at?: string;
          from_status?: Database["public"]["Enums"]["application_status"] | null;
          id?: string;
          note?: string | null;
          to_status: Database["public"]["Enums"]["application_status"];
        };
        Update: {
          application_id?: string;
          changed_by?: string | null;
          created_at?: string;
          from_status?: Database["public"]["Enums"]["application_status"] | null;
          id?: string;
          note?: string | null;
          to_status?: Database["public"]["Enums"]["application_status"];
        };
        Relationships: [
          {
            foreignKeyName: "application_status_history_application_id_fkey";
            columns: ["application_id"];
            isOneToOne: false;
            referencedRelation: "applications";
            referencedColumns: ["id"];
          },
        ];
      };
      applications: {
        Row: {
          address: string | null;
          admin_message: string | null;
          alt_phone: string | null;
          application_number: string;
          county: string | null;
          course_id: string | null;
          created_at: string;
          date_of_birth: string | null;
          email: string;
          first_name: string;
          gender: string | null;
          heard_about: string | null;
          highest_qualification: string | null;
          id: string;
          institution_attended: string | null;
          intake_id: string | null;
          level_id: string | null;
          kcse_grade: string | null;
          last_name: string;
          middle_name: string | null;
          national_id: string | null;
          phone: string;
          previous_training: string | null;
          school_id: string | null;
          special_requirements: string | null;
          status: Database["public"]["Enums"]["application_status"];
          study_mode: Database["public"]["Enums"]["study_mode"];
          town: string | null;
          updated_at: string;
          upload_token: string;
          work_experience: string | null;
          year_completed: number | null;
        };
        Insert: {
          address?: string | null;
          admin_message?: string | null;
          alt_phone?: string | null;
          application_number: string;
          county?: string | null;
          course_id?: string | null;
          created_at?: string;
          date_of_birth?: string | null;
          email: string;
          first_name: string;
          gender?: string | null;
          heard_about?: string | null;
          highest_qualification?: string | null;
          id?: string;
          institution_attended?: string | null;
          intake_id?: string | null;
          level_id?: string | null;
          kcse_grade?: string | null;
          last_name: string;
          middle_name?: string | null;
          national_id?: string | null;
          phone: string;
          previous_training?: string | null;
          school_id?: string | null;
          special_requirements?: string | null;
          status?: Database["public"]["Enums"]["application_status"];
          study_mode?: Database["public"]["Enums"]["study_mode"];
          town?: string | null;
          updated_at?: string;
          upload_token?: string;
          work_experience?: string | null;
          year_completed?: number | null;
        };
        Update: {
          address?: string | null;
          admin_message?: string | null;
          alt_phone?: string | null;
          application_number?: string;
          county?: string | null;
          course_id?: string | null;
          created_at?: string;
          date_of_birth?: string | null;
          email?: string;
          first_name?: string;
          gender?: string | null;
          heard_about?: string | null;
          highest_qualification?: string | null;
          id?: string;
          institution_attended?: string | null;
          intake_id?: string | null;
          level_id?: string | null;
          kcse_grade?: string | null;
          last_name?: string;
          middle_name?: string | null;
          national_id?: string | null;
          phone?: string;
          previous_training?: string | null;
          school_id?: string | null;
          special_requirements?: string | null;
          status?: Database["public"]["Enums"]["application_status"];
          study_mode?: Database["public"]["Enums"]["study_mode"];
          town?: string | null;
          updated_at?: string;
          upload_token?: string;
          work_experience?: string | null;
          year_completed?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "applications_course_id_fkey";
            columns: ["course_id"];
            isOneToOne: false;
            referencedRelation: "courses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "applications_intake_id_fkey";
            columns: ["intake_id"];
            isOneToOne: false;
            referencedRelation: "intakes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "applications_level_id_fkey";
            columns: ["level_id"];
            isOneToOne: false;
            referencedRelation: "course_levels";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "applications_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      application_unit_selections: TableShape<
        { application_id: string; created_at: string; unit_id: string },
        { application_id: string; created_at?: string; unit_id: string },
        { application_id?: string; created_at?: string; unit_id?: string }
      >;
      article_categories: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          slug: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          slug: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          slug?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      articles: {
        Row: {
          attachment_type: string | null;
          attachment_file_name: string | null;
          attachment_url: string | null;
          author: string | null;
          category_id: string | null;
          content: string;
          created_at: string;
          created_by: string | null;
          excerpt: string | null;
          featured_image: string | null;
          id: string;
          meta_description: string | null;
          meta_title: string | null;
          og_image: string | null;
          published_at: string | null;
          slug: string;
          status: Database["public"]["Enums"]["article_status"];
          tags: string[];
          title: string;
          updated_at: string;
        };
        Insert: {
          attachment_type?: string | null;
          attachment_file_name?: string | null;
          attachment_url?: string | null;
          author?: string | null;
          category_id?: string | null;
          content?: string;
          created_at?: string;
          created_by?: string | null;
          excerpt?: string | null;
          featured_image?: string | null;
          id?: string;
          meta_description?: string | null;
          meta_title?: string | null;
          og_image?: string | null;
          published_at?: string | null;
          slug: string;
          status?: Database["public"]["Enums"]["article_status"];
          tags?: string[];
          title: string;
          updated_at?: string;
        };
        Update: {
          attachment_type?: string | null;
          attachment_file_name?: string | null;
          attachment_url?: string | null;
          author?: string | null;
          category_id?: string | null;
          content?: string;
          created_at?: string;
          created_by?: string | null;
          excerpt?: string | null;
          featured_image?: string | null;
          id?: string;
          meta_description?: string | null;
          meta_title?: string | null;
          og_image?: string | null;
          published_at?: string | null;
          slug?: string;
          status?: Database["public"]["Enums"]["article_status"];
          tags?: string[];
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "articles_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "article_categories";
            referencedColumns: ["id"];
          },
        ];
      };
      assignments: {
        Row: {
          course_id: string;
          created_at: string;
          created_by: string | null;
          due_date: string | null;
          file_path: string | null;
          id: string;
          instructions: string | null;
          level_ids: string[] | null;
          published: boolean;
          title: string;
          unit_id: string | null;
          updated_at: string;
        };
        Insert: {
          course_id: string;
          created_at?: string;
          created_by?: string | null;
          due_date?: string | null;
          file_path?: string | null;
          id?: string;
          instructions?: string | null;
          level_ids?: string[] | null;
          published?: boolean;
          title: string;
          unit_id?: string | null;
          updated_at?: string;
        };
        Update: {
          course_id?: string;
          created_at?: string;
          created_by?: string | null;
          due_date?: string | null;
          file_path?: string | null;
          id?: string;
          instructions?: string | null;
          level_ids?: string[] | null;
          published?: boolean;
          title?: string;
          unit_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "assignments_course_id_fkey";
            columns: ["course_id"];
            isOneToOne: false;
            referencedRelation: "courses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "assignments_unit_id_fkey";
            columns: ["unit_id"];
            isOneToOne: false;
            referencedRelation: "course_units";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_logs: {
        Row: {
          action: string;
          actor_id: string | null;
          created_at: string;
          details: Json;
          entity: string | null;
          entity_id: string | null;
          id: string;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          created_at?: string;
          details?: Json;
          entity?: string | null;
          entity_id?: string | null;
          id?: string;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          created_at?: string;
          details?: Json;
          entity?: string | null;
          entity_id?: string | null;
          id?: string;
        };
        Relationships: [];
      };
      contact_messages: {
        Row: {
          created_at: string;
          email: string | null;
          id: string;
          message: string;
          name: string;
          phone: string | null;
          status: string;
          subject: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          email?: string | null;
          id?: string;
          message: string;
          name: string;
          phone?: string | null;
          status?: string;
          subject?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          email?: string | null;
          id?: string;
          message?: string;
          name?: string;
          phone?: string | null;
          status?: string;
          subject?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      contact_message_replies: {
        Row: {
          attachment_names: string[];
          body: string;
          created_at: string;
          id: string;
          message_id: string;
          sender_id: string;
          sent_at: string | null;
          status: string;
          subject: string;
        };
        Insert: {
          attachment_names?: string[];
          body: string;
          created_at?: string;
          id?: string;
          message_id: string;
          sender_id: string;
          sent_at?: string | null;
          status?: string;
          subject: string;
        };
        Update: {
          attachment_names?: string[];
          body?: string;
          created_at?: string;
          id?: string;
          message_id?: string;
          sender_id?: string;
          sent_at?: string | null;
          status?: string;
          subject?: string;
        };
        Relationships: [
          {
            foreignKeyName: "contact_message_replies_message_id_fkey";
            columns: ["message_id"];
            isOneToOne: false;
            referencedRelation: "contact_messages";
            referencedColumns: ["id"];
          },
        ];
      };
      course_levels: {
        Row: {
          code: string | null;
          course_id: string;
          created_at: string;
          description: string | null;
          fee_items: Json;
          fee_structure_file_name: string | null;
          fee_structure_path: string | null;
          fee_structure_url: string | null;
          id: string;
          name: string;
          published: boolean;
          sort_order: number;
          total_fee: number;
          updated_at: string;
        };
        Insert: {
          code?: string | null;
          course_id: string;
          created_at?: string;
          description?: string | null;
          fee_items?: Json;
          fee_structure_file_name?: string | null;
          fee_structure_path?: string | null;
          fee_structure_url?: string | null;
          id?: string;
          name: string;
          published?: boolean;
          sort_order?: number;
          total_fee?: number;
          updated_at?: string;
        };
        Update: {
          code?: string | null;
          course_id?: string;
          created_at?: string;
          description?: string | null;
          fee_items?: Json;
          fee_structure_file_name?: string | null;
          fee_structure_path?: string | null;
          fee_structure_url?: string | null;
          id?: string;
          name?: string;
          published?: boolean;
          sort_order?: number;
          total_fee?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "course_levels_course_id_fkey";
            columns: ["course_id"];
            isOneToOne: false;
            referencedRelation: "courses";
            referencedColumns: ["id"];
          },
        ];
      };
      course_units: {
        Row: {
          code: string | null;
          course_id: string;
          created_at: string;
          id: string;
          level_id: string | null;
          semester: string | null;
          sort_order: number;
          title: string;
          updated_at: string;
        };
        Insert: {
          code?: string | null;
          course_id: string;
          created_at?: string;
          id?: string;
          level_id?: string | null;
          semester?: string | null;
          sort_order?: number;
          title: string;
          updated_at?: string;
        };
        Update: {
          code?: string | null;
          course_id?: string;
          created_at?: string;
          id?: string;
          level_id?: string | null;
          semester?: string | null;
          sort_order?: number;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "course_units_course_id_fkey";
            columns: ["course_id"];
            isOneToOne: false;
            referencedRelation: "courses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "course_units_level_id_fkey";
            columns: ["level_id"];
            isOneToOne: false;
            referencedRelation: "course_levels";
            referencedColumns: ["id"];
          },
        ];
      };
      courses: {
        Row: {
          application_enabled: boolean;
          available_online: boolean;
          created_at: string;
          course_code: string | null;
          description: string | null;
          duration: string | null;
          featured: boolean;
          fees: number | null;
          id: string;
          image_url: string | null;
          online_certificate_fee: number;
          online_exam_fee: number;
          online_intro_video_url: string | null;
          online_lecturer_email: string | null;
          online_lecturer_name: string | null;
          online_lecturer_phone: string | null;
          online_syllabus: string | null;
          published: boolean;
          requirements: string | null;
          school_id: string;
          slug: string;
          sort_order: number;
          study_mode: Database["public"]["Enums"]["study_mode"];
          summary: string | null;
          title: string;
          updated_at: string;
        };
        Insert: {
          application_enabled?: boolean;
          available_online?: boolean;
          created_at?: string;
          course_code?: string | null;
          description?: string | null;
          duration?: string | null;
          featured?: boolean;
          fees?: number | null;
          id?: string;
          image_url?: string | null;
          online_certificate_fee?: number;
          online_exam_fee?: number;
          online_intro_video_url?: string | null;
          online_lecturer_email?: string | null;
          online_lecturer_name?: string | null;
          online_lecturer_phone?: string | null;
          online_syllabus?: string | null;
          published?: boolean;
          requirements?: string | null;
          school_id: string;
          slug: string;
          sort_order?: number;
          study_mode?: Database["public"]["Enums"]["study_mode"];
          summary?: string | null;
          title: string;
          updated_at?: string;
        };
        Update: {
          application_enabled?: boolean;
          available_online?: boolean;
          created_at?: string;
          course_code?: string | null;
          description?: string | null;
          duration?: string | null;
          featured?: boolean;
          fees?: number | null;
          id?: string;
          image_url?: string | null;
          online_certificate_fee?: number;
          online_exam_fee?: number;
          online_intro_video_url?: string | null;
          online_lecturer_email?: string | null;
          online_lecturer_name?: string | null;
          online_lecturer_phone?: string | null;
          online_syllabus?: string | null;
          published?: boolean;
          requirements?: string | null;
          school_id?: string;
          slug?: string;
          sort_order?: number;
          study_mode?: Database["public"]["Enums"]["study_mode"];
          summary?: string | null;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "courses_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      email_outbox: {
        Row: {
          created_at: string;
          error: string | null;
          id: string;
          payload: Json;
          sent_at: string | null;
          status: string;
          subject: string;
          template: string;
          to_email: string;
        };
        Insert: {
          created_at?: string;
          error?: string | null;
          id?: string;
          payload?: Json;
          sent_at?: string | null;
          status?: string;
          subject: string;
          template: string;
          to_email: string;
        };
        Update: {
          created_at?: string;
          error?: string | null;
          id?: string;
          payload?: Json;
          sent_at?: string | null;
          status?: string;
          subject?: string;
          template?: string;
          to_email?: string;
        };
        Relationships: [];
      };
      enrollments: {
        Row: {
          academic_year: string | null;
          application_id: string | null;
          course_id: string;
          created_at: string;
          id: string;
          intake_id: string | null;
          level_id: string | null;
          progress: number;
          status: string;
          student_id: string;
          updated_at: string;
        };
        Insert: {
          academic_year?: string | null;
          application_id?: string | null;
          course_id: string;
          created_at?: string;
          id?: string;
          intake_id?: string | null;
          kasneb_number?: string | null;
          level_id?: string | null;
          progress?: number;
          status?: string;
          student_id: string;
          updated_at?: string;
        };
        Update: {
          academic_year?: string | null;
          application_id?: string | null;
          course_id?: string;
          created_at?: string;
          id?: string;
          intake_id?: string | null;
          kasneb_number?: string | null;
          level_id?: string | null;
          progress?: number;
          status?: string;
          student_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "enrollments_application_id_fkey";
            columns: ["application_id"];
            isOneToOne: true;
            referencedRelation: "applications";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "enrollments_course_id_fkey";
            columns: ["course_id"];
            isOneToOne: false;
            referencedRelation: "courses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "enrollments_intake_id_fkey";
            columns: ["intake_id"];
            isOneToOne: false;
            referencedRelation: "intakes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "enrollments_level_id_fkey";
            columns: ["level_id"];
            isOneToOne: false;
            referencedRelation: "course_levels";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "enrollments_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
        ];
      };
      exam_sittings: TableShape<
        {
          created_at: string;
          created_by: string | null;
          course_id: string;
          exam_body: string;
          exam_date: string | null;
          id: string;
          level_id: string;
          minimum_passing_score: number;
          qualification: string;
          registration_deadline: string | null;
          required_unit_ids: string[];
          status: string;
          title: string;
          updated_at: string;
        },
        {
          created_at?: string;
          created_by?: string | null;
          course_id: string;
          exam_body: string;
          exam_date?: string | null;
          id?: string;
          level_id: string;
          minimum_passing_score?: number;
          qualification: string;
          registration_deadline?: string | null;
          required_unit_ids?: string[];
          status?: string;
          title: string;
          updated_at?: string;
        }
      >;
      exam_sitting_candidates: TableShape<
        {
          created_at: string;
          external_reference: string | null;
          id: string;
          nominated_by: string | null;
          notes: string | null;
          sitting_id: string;
          status: string;
          student_id: string;
          updated_at: string;
        },
        {
          created_at?: string;
          external_reference?: string | null;
          id?: string;
          nominated_by?: string | null;
          notes?: string | null;
          sitting_id: string;
          status?: string;
          student_id: string;
          updated_at?: string;
        }
      >;
      faqs: {
        Row: {
          answer: string;
          category: string;
          created_at: string;
          id: string;
          published: boolean;
          question: string;
          school_id: string | null;
          sort_order: number;
          updated_at: string;
        };
        Insert: {
          answer?: string;
          category?: string;
          created_at?: string;
          id?: string;
          published?: boolean;
          question: string;
          school_id?: string | null;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          answer?: string;
          category?: string;
          created_at?: string;
          id?: string;
          published?: boolean;
          question?: string;
          school_id?: string | null;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "faqs_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      faq_search_insights: {
        Row: {
          bucket: number;
          faq_id: string;
          search_count: number;
          search_date: string;
        };
        Insert: {
          bucket: number;
          faq_id: string;
          search_count?: number;
          search_date?: string;
        };
        Update: {
          bucket?: number;
          faq_id?: string;
          search_count?: number;
          search_date?: string;
        };
        Relationships: [
          {
            foreignKeyName: "faq_search_insights_faq_id_fkey";
            columns: ["faq_id"];
            isOneToOne: false;
            referencedRelation: "faqs";
            referencedColumns: ["id"];
          },
        ];
      };
      fee_documents: {
        Row: {
          created_at: string;
          document_type: string;
          id: string;
          payment_id: string | null;
          storage_path: string;
          student_id: string;
        };
        Insert: {
          created_at?: string;
          document_type: string;
          id?: string;
          payment_id?: string | null;
          storage_path: string;
          student_id: string;
        };
        Update: {
          created_at?: string;
          document_type?: string;
          id?: string;
          payment_id?: string | null;
          storage_path?: string;
          student_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "fee_documents_payment_id_fkey";
            columns: ["payment_id"];
            isOneToOne: true;
            referencedRelation: "payments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fee_documents_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
        ];
      };
      fees: {
        Row: {
          academic_year: string | null;
          amount: number;
          created_at: string;
          description: string;
          due_date: string | null;
          id: string;
          student_id: string;
          updated_at: string;
        };
        Insert: {
          academic_year?: string | null;
          amount: number;
          created_at?: string;
          description: string;
          due_date?: string | null;
          id?: string;
          student_id: string;
          updated_at?: string;
        };
        Update: {
          academic_year?: string | null;
          amount?: number;
          created_at?: string;
          description?: string;
          due_date?: string | null;
          id?: string;
          student_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "fees_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
        ];
      };
      holiday_program_applications: TableShape<
        {
          admin_notes: string;
          amount_due: number;
          applicant_age: number | null;
          applicant_name: string;
          confirmation_code: string;
          created_at: string;
          deposit_amount: number;
          discount_percent: number;
          email: string | null;
          fee_amount: number;
          guardian_consent: boolean;
          guardian_email: string | null;
          guardian_name: string | null;
          guardian_phone: string | null;
          id: string;
          location: string;
          module_ids: string[];
          payment_status: string;
          period_id: string;
          phone: string;
          reviewed_at: string | null;
          reviewed_by: string | null;
          status: string;
          submitted_at: string;
          track_id: string;
          updated_at: string;
        },
        {
          admin_notes?: string;
          amount_due: number;
          applicant_age?: number | null;
          applicant_name: string;
          confirmation_code?: string;
          created_at?: string;
          deposit_amount: number;
          discount_percent: number;
          email?: string | null;
          fee_amount: number;
          guardian_consent?: boolean;
          guardian_email?: string | null;
          guardian_name?: string | null;
          guardian_phone?: string | null;
          id?: string;
          location: string;
          module_ids: string[];
          payment_status?: string;
          period_id: string;
          phone: string;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: string;
          submitted_at?: string;
          track_id: string;
          updated_at?: string;
        }
      >;
      holiday_program_modules: TableShape<
        {
          active: boolean;
          created_at: string;
          description: string;
          duration: string;
          id: string;
          title: string;
          track_id: string;
          updated_at: string;
        },
        {
          active?: boolean;
          created_at?: string;
          description?: string;
          duration?: string;
          id?: string;
          title: string;
          track_id: string;
          updated_at?: string;
        }
      >;
      holiday_program_payments: TableShape<
        {
          amount: number;
          application_id: string;
          created_at: string;
          id: string;
          mpesa_receipt_number: string | null;
          paid_at: string | null;
          payer_phone: string;
          provider: string;
          provider_checkout_id: string | null;
          provider_reference: string | null;
          raw: Json;
          reference: string;
          status: string;
          updated_at: string;
        },
        {
          amount: number;
          application_id: string;
          created_at?: string;
          id?: string;
          mpesa_receipt_number?: string | null;
          paid_at?: string | null;
          payer_phone: string;
          provider?: string;
          provider_checkout_id?: string | null;
          provider_reference?: string | null;
          raw?: Json;
          reference: string;
          status?: string;
          updated_at?: string;
        },
        {
          amount?: number;
          application_id?: string;
          created_at?: string;
          id?: string;
          mpesa_receipt_number?: string | null;
          paid_at?: string | null;
          payer_phone?: string;
          provider?: string;
          provider_checkout_id?: string | null;
          provider_reference?: string | null;
          raw?: Json;
          reference?: string;
          status?: string;
          updated_at?: string;
        }
      >;
      holiday_program_application_history: TableShape<
        {
          application_id: string;
          changed_at: string;
          changed_by: string | null;
          id: string;
          new_values: Json;
          previous_values: Json;
        },
        {
          application_id: string;
          changed_at?: string;
          changed_by?: string | null;
          id?: string;
          new_values: Json;
          previous_values: Json;
        }
      >;
      holiday_program_period_modules: TableShape<
        { module_id: string; period_id: string },
        { module_id: string; period_id: string }
      >;
      holiday_program_periods: TableShape<
        {
          capacity: number | null;
          created_at: string;
          deposit_amount: number;
          discount_percent: number;
          ends_on: string;
          fee_amount: number;
          id: string;
          location: string;
          offer_deadline: string | null;
          registration_deadline: string | null;
          schedule: string;
          starts_on: string;
          status: string;
          title: string;
          track_id: string;
          updated_at: string;
        },
        {
          capacity?: number | null;
          created_at?: string;
          deposit_amount?: number;
          discount_percent?: number;
          ends_on: string;
          fee_amount?: number;
          id?: string;
          location?: string;
          offer_deadline?: string | null;
          registration_deadline?: string | null;
          schedule?: string;
          starts_on: string;
          status?: string;
          title: string;
          track_id: string;
          updated_at?: string;
        }
      >;
      holiday_program_tracks: TableShape<
        {
          contact_email: string;
          contact_phone: string;
          created_at: string;
          description: string;
          id: string;
          location: string;
          max_age: number | null;
          min_age: number | null;
          published: boolean;
          subtitle: string;
          title: string;
          track_key: string;
          updated_at: string;
        },
        {
          contact_email?: string;
          contact_phone?: string;
          created_at?: string;
          description?: string;
          id?: string;
          location?: string;
          max_age?: number | null;
          min_age?: number | null;
          published?: boolean;
          subtitle?: string;
          title: string;
          track_key: string;
          updated_at?: string;
        }
      >;
      intakes: {
        Row: {
          application_deadline: string | null;
          created_at: string;
          end_date: string | null;
          id: string;
          is_open: boolean;
          name: string;
          notes: string | null;
          start_date: string | null;
          updated_at: string;
        };
        Insert: {
          application_deadline?: string | null;
          created_at?: string;
          end_date?: string | null;
          id?: string;
          is_open?: boolean;
          name: string;
          notes?: string | null;
          start_date?: string | null;
          updated_at?: string;
        };
        Update: {
          application_deadline?: string | null;
          created_at?: string;
          end_date?: string | null;
          id?: string;
          is_open?: boolean;
          name?: string;
          notes?: string | null;
          start_date?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      learning_materials: {
        Row: {
          course_id: string;
          created_at: string;
          description: string | null;
          external_url: string | null;
          file_path: string | null;
          id: string;
          material_type: string;
          published: boolean;
          title: string;
          unit_id: string | null;
          updated_at: string;
          uploaded_by: string | null;
        };
        Insert: {
          course_id: string;
          created_at?: string;
          description?: string | null;
          external_url?: string | null;
          file_path?: string | null;
          id?: string;
          material_type?: string;
          published?: boolean;
          title: string;
          unit_id?: string | null;
          updated_at?: string;
          uploaded_by?: string | null;
        };
        Update: {
          course_id?: string;
          created_at?: string;
          description?: string | null;
          external_url?: string | null;
          file_path?: string | null;
          id?: string;
          material_type?: string;
          published?: boolean;
          title?: string;
          unit_id?: string | null;
          updated_at?: string;
          uploaded_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "learning_materials_course_id_fkey";
            columns: ["course_id"];
            isOneToOne: false;
            referencedRelation: "courses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "learning_materials_unit_id_fkey";
            columns: ["unit_id"];
            isOneToOne: false;
            referencedRelation: "course_units";
            referencedColumns: ["id"];
          },
        ];
      };
      media: {
        Row: {
          alt: string | null;
          caption: string | null;
          category: string;
          created_at: string;
          file_path: string | null;
          id: string;
          link_url: string | null;
          published: boolean;
          slot: string | null;
          sort_order: number;
          updated_at: string;
          uploaded_by: string | null;
          url: string;
        };
        Insert: {
          alt?: string | null;
          caption?: string | null;
          category?: string;
          created_at?: string;
          file_path?: string | null;
          id?: string;
          link_url?: string | null;
          published?: boolean;
          slot?: string | null;
          sort_order?: number;
          updated_at?: string;
          uploaded_by?: string | null;
          url: string;
        };
        Update: {
          alt?: string | null;
          caption?: string | null;
          category?: string;
          created_at?: string;
          file_path?: string | null;
          id?: string;
          link_url?: string | null;
          published?: boolean;
          slot?: string | null;
          sort_order?: number;
          updated_at?: string;
          uploaded_by?: string | null;
          url?: string;
        };
        Relationships: [];
      };
      notifications: {
        Row: {
          body: string | null;
          category: string;
          created_at: string;
          id: string;
          read: boolean;
          reference_id: string | null;
          title: string;
          user_id: string;
        };
        Insert: {
          body?: string | null;
          category?: string;
          created_at?: string;
          id?: string;
          read?: boolean;
          reference_id?: string | null;
          title: string;
          user_id: string;
        };
        Update: {
          body?: string | null;
          category?: string;
          created_at?: string;
          id?: string;
          read?: boolean;
          reference_id?: string | null;
          title?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      payments: {
        Row: {
          amount: number;
          created_at: string;
          id: string;
          method: string;
          paid_at: string;
          provider: string | null;
          raw: Json | null;
          recorded_by: string | null;
          reference: string | null;
          status: string;
          student_id: string;
          updated_at: string;
        };
        Insert: {
          amount: number;
          created_at?: string;
          id?: string;
          method?: string;
          paid_at?: string;
          provider?: string | null;
          raw?: Json | null;
          recorded_by?: string | null;
          reference?: string | null;
          status?: string;
          student_id: string;
          updated_at?: string;
        };
        Update: {
          amount?: number;
          created_at?: string;
          id?: string;
          method?: string;
          paid_at?: string;
          provider?: string | null;
          raw?: Json | null;
          recorded_by?: string | null;
          reference?: string | null;
          status?: string;
          student_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payments_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
        ];
      };
      online_course_enrollments: {
        Row: {
          certificate_fee: number;
          course_id: string;
          created_at: string;
          exam_fee: number;
          id: string;
          level_id: string | null;
          status: string;
          student_id: string;
          tuition_fee: number;
        };
        Insert: {
          certificate_fee?: number;
          course_id: string;
          created_at?: string;
          exam_fee?: number;
          id?: string;
          level_id?: string | null;
          status?: string;
          student_id: string;
          tuition_fee: number;
        };
        Update: {
          certificate_fee?: number;
          course_id?: string;
          created_at?: string;
          exam_fee?: number;
          id?: string;
          level_id?: string | null;
          status?: string;
          student_id?: string;
          tuition_fee?: number;
        };
        Relationships: [];
      };
      online_course_lessons: {
        Row: {
          course_id: string;
          created_at: string;
          description: string | null;
          duration_seconds: number;
          file_path: string | null;
          file_type: string | null;
          id: string;
          is_preview: boolean;
          notes: string | null;
          published: boolean;
          section_title: string;
          sort_order: number;
          title: string;
          updated_at: string;
          video_url: string | null;
        };
        Insert: {
          course_id: string;
          created_at?: string;
          description?: string | null;
          duration_seconds?: number;
          file_path?: string | null;
          file_type?: string | null;
          id?: string;
          is_preview?: boolean;
          notes?: string | null;
          published?: boolean;
          section_title?: string;
          sort_order?: number;
          title: string;
          updated_at?: string;
          video_url?: string | null;
        };
        Update: {
          course_id?: string;
          created_at?: string;
          description?: string | null;
          duration_seconds?: number;
          file_path?: string | null;
          file_type?: string | null;
          id?: string;
          is_preview?: boolean;
          notes?: string | null;
          published?: boolean;
          section_title?: string;
          sort_order?: number;
          title?: string;
          updated_at?: string;
          video_url?: string | null;
        };
        Relationships: [];
      };
      online_course_payments: {
        Row: {
          amount: number;
          course_id: string;
          created_at: string;
          enrollment_id: string;
          id: string;
          paid_at: string | null;
          provider: string;
          provider_checkout_id: string | null;
          provider_reference: string | null;
          raw: Json;
          reference: string;
          stage: string;
          status: string;
          student_id: string;
          updated_at: string;
        };
        Insert: {
          amount: number;
          course_id: string;
          created_at?: string;
          enrollment_id: string;
          id?: string;
          paid_at?: string | null;
          provider?: string;
          provider_checkout_id?: string | null;
          provider_reference?: string | null;
          raw?: Json;
          reference: string;
          stage: string;
          status?: string;
          student_id: string;
          updated_at?: string;
        };
        Update: {
          amount?: number;
          course_id?: string;
          created_at?: string;
          enrollment_id?: string;
          id?: string;
          paid_at?: string | null;
          provider?: string;
          provider_checkout_id?: string | null;
          provider_reference?: string | null;
          raw?: Json;
          reference?: string;
          stage?: string;
          status?: string;
          student_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      online_lesson_progress: {
        Row: {
          completed_at: string;
          lesson_id: string;
          student_id: string;
        };
        Insert: {
          completed_at?: string;
          lesson_id: string;
          student_id: string;
        };
        Update: {
          completed_at?: string;
          lesson_id?: string;
          student_id?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          email: string | null;
          full_name: string | null;
          id: string;
          phone: string | null;
          updated_at: string;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          email?: string | null;
          full_name?: string | null;
          id: string;
          phone?: string | null;
          updated_at?: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          email?: string | null;
          full_name?: string | null;
          id?: string;
          phone?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      facilitator_unit_assignments: TableShape<
        {
          active: boolean;
          can_manage_assignments: boolean;
          can_manage_cats: boolean;
          can_manage_materials: boolean;
          can_manage_results: boolean;
          created_at: string;
          created_by: string | null;
          facilitator_id: string;
          id: string;
          unit_id: string;
          updated_at: string;
        },
        {
          active?: boolean;
          can_manage_assignments?: boolean;
          can_manage_cats?: boolean;
          can_manage_materials?: boolean;
          can_manage_results?: boolean;
          created_at?: string;
          created_by?: string | null;
          facilitator_id: string;
          id?: string;
          unit_id: string;
          updated_at?: string;
        }
      >;
      portal_conversations: TableShape<
        { created_at: string; id: string; student_id: string; updated_at: string },
        { created_at?: string; id?: string; student_id: string; updated_at?: string }
      >;
      portal_messages: TableShape<
        {
          body: string;
          conversation_id: string;
          created_at: string;
          id: string;
          read_at: string | null;
          sender_id: string;
        },
        {
          body: string;
          conversation_id: string;
          created_at?: string;
          id?: string;
          read_at?: string | null;
          sender_id: string;
        }
      >;
      student_course_feedback: TableShape<
        {
          admin_reply: string | null;
          body: string;
          category: string;
          created_at: string;
          id: string;
          status: string;
          student_id: string;
          subject: string;
          updated_at: string;
        },
        {
          admin_reply?: string | null;
          body: string;
          category: string;
          created_at?: string;
          id?: string;
          status?: string;
          student_id: string;
          subject: string;
          updated_at?: string;
        }
      >;
      student_level_applications: TableShape<
        {
          admin_message: string | null;
          created_at: string;
          id: string;
          level_id: string;
          reviewed_at: string | null;
          reviewed_by: string | null;
          status: string;
          student_id: string;
          student_message: string | null;
          updated_at: string;
        },
        {
          admin_message?: string | null;
          created_at?: string;
          id?: string;
          level_id: string;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: string;
          student_id: string;
          student_message?: string | null;
          updated_at?: string;
        }
      >;
      student_course_units: TableShape<
        {
          course_id: string;
          level_id: string | null;
          selected_at: string;
          student_id: string;
          unit_id: string;
        },
        {
          course_id: string;
          level_id?: string | null;
          selected_at?: string;
          student_id: string;
          unit_id: string;
        },
        {
          course_id?: string;
          level_id?: string | null;
          selected_at?: string;
          student_id?: string;
          unit_id?: string;
        }
      >;
      progression_followups: {
        Row: {
          attempts: number;
          created_at: string;
          due_at: string;
          id: string;
          last_error: string | null;
          result_id: string;
          rule_id: string;
          sent_at: string | null;
          status: string;
          student_id: string;
          updated_at: string;
        };
        Insert: {
          attempts?: number;
          created_at?: string;
          due_at: string;
          id?: string;
          last_error?: string | null;
          result_id: string;
          rule_id: string;
          sent_at?: string | null;
          status?: string;
          student_id: string;
          updated_at?: string;
        };
        Update: {
          attempts?: number;
          created_at?: string;
          due_at?: string;
          id?: string;
          last_error?: string | null;
          result_id?: string;
          rule_id?: string;
          sent_at?: string | null;
          status?: string;
          student_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      progression_rules: {
        Row: {
          created_at: string;
          created_by: string | null;
          delay_days: number;
          enabled: boolean;
          exam_name_pattern: string;
          id: string;
          message: string;
          minimum_score: number;
          name: string;
          next_course_id: string;
          source_course_id: string;
          subject: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          delay_days?: number;
          enabled?: boolean;
          exam_name_pattern?: string;
          id?: string;
          message?: string;
          minimum_score?: number;
          name: string;
          next_course_id: string;
          source_course_id: string;
          subject?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          delay_days?: number;
          enabled?: boolean;
          exam_name_pattern?: string;
          id?: string;
          message?: string;
          minimum_score?: number;
          name?: string;
          next_course_id?: string;
          source_course_id?: string;
          subject?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      regulatory_action_items: {
        Row: {
          agency: string;
          category: string;
          created_at: string;
          created_by: string | null;
          details: string | null;
          due_date: string;
          id: string;
          notes: string | null;
          reference_url: string | null;
          status: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          agency: string;
          category: string;
          created_at?: string;
          created_by?: string | null;
          details?: string | null;
          due_date: string;
          id?: string;
          notes?: string | null;
          reference_url?: string | null;
          status?: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          agency?: string;
          category?: string;
          created_at?: string;
          created_by?: string | null;
          details?: string | null;
          due_date?: string;
          id?: string;
          notes?: string | null;
          reference_url?: string | null;
          status?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      regulatory_deadline_reminders: TableShape<
        {
          action_id: string;
          attempts: number;
          channel: string;
          created_at: string;
          days_before: number;
          due_date: string;
          id: string;
          last_error: string | null;
          next_attempt_at: string;
          payload: Json;
          recipient: string;
          recipient_user_id: string;
          scheduled_for: string;
          sent_at: string | null;
          status: string;
          updated_at: string;
        },
        {
          action_id: string;
          attempts?: number;
          channel: string;
          created_at?: string;
          days_before: number;
          due_date: string;
          id?: string;
          last_error?: string | null;
          next_attempt_at?: string;
          payload?: Json;
          recipient: string;
          recipient_user_id: string;
          scheduled_for: string;
          sent_at?: string | null;
          status?: string;
          updated_at?: string;
        }
      >;
      regulatory_feed_syncs: {
        Row: {
          error_message: string | null;
          feed_url: string;
          items_received: number;
          last_attempted_at: string;
          last_successful_at: string | null;
          source_key: string;
          source_name: string;
          status: string;
        };
        Insert: {
          error_message?: string | null;
          feed_url: string;
          items_received?: number;
          last_attempted_at?: string;
          last_successful_at?: string | null;
          source_key: string;
          source_name: string;
          status: string;
        };
        Update: {
          error_message?: string | null;
          feed_url?: string;
          items_received?: number;
          last_attempted_at?: string;
          last_successful_at?: string | null;
          source_key?: string;
          source_name?: string;
          status?: string;
        };
        Relationships: [];
      };
      regulatory_source_updates: {
        Row: {
          article_url: string;
          fetched_at: string;
          id: string;
          published_at: string | null;
          source_key: string;
          source_name: string;
          summary: string | null;
          title: string;
        };
        Insert: {
          article_url: string;
          fetched_at?: string;
          id?: string;
          published_at?: string | null;
          source_key: string;
          source_name: string;
          summary?: string | null;
          title: string;
        };
        Update: {
          article_url?: string;
          fetched_at?: string;
          id?: string;
          published_at?: string | null;
          source_key?: string;
          source_name?: string;
          summary?: string | null;
          title?: string;
        };
        Relationships: [];
      };
      results: {
        Row: {
          academic_year: string | null;
          created_at: string;
          grade: string | null;
          id: string;
          published: boolean;
          score: number | null;
          semester: string | null;
          source_submission_id: string | null;
          student_id: string;
          unit_id: string | null;
          unit_name: string;
          updated_at: string;
        };
        Insert: {
          academic_year?: string | null;
          created_at?: string;
          grade?: string | null;
          id?: string;
          published?: boolean;
          score?: number | null;
          semester?: string | null;
          source_submission_id?: string | null;
          student_id: string;
          unit_id?: string | null;
          unit_name: string;
          updated_at?: string;
        };
        Update: {
          academic_year?: string | null;
          created_at?: string;
          grade?: string | null;
          id?: string;
          published?: boolean;
          score?: number | null;
          semester?: string | null;
          source_submission_id?: string | null;
          student_id?: string;
          unit_id?: string | null;
          unit_name?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "results_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "results_unit_id_fkey";
            columns: ["unit_id"];
            isOneToOne: false;
            referencedRelation: "course_units";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "results_source_submission_id_fkey";
            columns: ["source_submission_id"];
            isOneToOne: true;
            referencedRelation: "submissions";
            referencedColumns: ["id"];
          },
        ];
      };
      school_fee_structures: {
        Row: {
          created_at: string;
          description: string | null;
          file_name: string;
          file_path: string;
          id: string;
          published: boolean;
          school_id: string;
          sort_order: number;
          title: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          file_name: string;
          file_path: string;
          id?: string;
          published?: boolean;
          school_id: string;
          sort_order?: number;
          title: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          file_name?: string;
          file_path?: string;
          id?: string;
          published?: boolean;
          school_id?: string;
          sort_order?: number;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "school_fee_structures_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      schools: {
        Row: {
          created_at: string;
          description: string | null;
          features: Json;
          hero_image: string | null;
          id: string;
          name: string;
          online_course_count: number | null;
          online_summary: string | null;
          published: boolean;
          short_name: string | null;
          slug: string;
          sort_order: number;
          tagline: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          features?: Json;
          hero_image?: string | null;
          id?: string;
          name: string;
          online_course_count?: number | null;
          online_summary?: string | null;
          published?: boolean;
          short_name?: string | null;
          slug: string;
          sort_order?: number;
          tagline?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          features?: Json;
          hero_image?: string | null;
          id?: string;
          name?: string;
          online_course_count?: number | null;
          online_summary?: string | null;
          published?: boolean;
          short_name?: string | null;
          slug?: string;
          sort_order?: number;
          tagline?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      site_settings: {
        Row: {
          key: string;
          updated_at: string;
          updated_by: string | null;
          value: Json;
        };
        Insert: {
          key: string;
          updated_at?: string;
          updated_by?: string | null;
          value?: Json;
        };
        Update: {
          key?: string;
          updated_at?: string;
          updated_by?: string | null;
          value?: Json;
        };
        Relationships: [];
      };
      students: {
        Row: {
          address: string | null;
          alt_phone: string | null;
          application_id: string | null;
          county: string | null;
          course_id: string | null;
          created_at: string;
          current_semester: string | null;
          date_of_birth: string | null;
          email: string;
          first_name: string;
          gender: string | null;
          id: string;
          intake_id: string | null;
          kasneb_number: string | null;
          level_id: string | null;
          last_name: string;
          middle_name: string | null;
          national_id: string | null;
          phone: string | null;
          status: string;
          student_number: string;
          study_mode: Database["public"]["Enums"]["study_mode"];
          town: string | null;
          updated_at: string;
          user_id: string | null;
        };
        Insert: {
          address?: string | null;
          alt_phone?: string | null;
          application_id?: string | null;
          county?: string | null;
          course_id?: string | null;
          created_at?: string;
          current_semester?: string | null;
          date_of_birth?: string | null;
          email: string;
          first_name: string;
          gender?: string | null;
          id?: string;
          intake_id?: string | null;
          kasneb_number?: string | null;
          level_id?: string | null;
          last_name: string;
          middle_name?: string | null;
          national_id?: string | null;
          phone?: string | null;
          status?: string;
          student_number: string;
          study_mode?: Database["public"]["Enums"]["study_mode"];
          town?: string | null;
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          address?: string | null;
          alt_phone?: string | null;
          application_id?: string | null;
          county?: string | null;
          course_id?: string | null;
          created_at?: string;
          current_semester?: string | null;
          date_of_birth?: string | null;
          email?: string;
          first_name?: string;
          gender?: string | null;
          id?: string;
          intake_id?: string | null;
          kasneb_number?: string | null;
          level_id?: string | null;
          last_name?: string;
          middle_name?: string | null;
          national_id?: string | null;
          phone?: string | null;
          status?: string;
          student_number?: string;
          study_mode?: Database["public"]["Enums"]["study_mode"];
          town?: string | null;
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "students_application_id_fkey";
            columns: ["application_id"];
            isOneToOne: false;
            referencedRelation: "applications";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "students_course_id_fkey";
            columns: ["course_id"];
            isOneToOne: false;
            referencedRelation: "courses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "students_intake_id_fkey";
            columns: ["intake_id"];
            isOneToOne: false;
            referencedRelation: "intakes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "students_level_id_fkey";
            columns: ["level_id"];
            isOneToOne: false;
            referencedRelation: "course_levels";
            referencedColumns: ["id"];
          },
        ];
      };
      student_documents: {
        Row: {
          created_at: string;
          document_type: string;
          file_name: string;
          file_path: string;
          id: string;
          student_id: string;
          uploaded_by: string;
        };
        Insert: {
          created_at?: string;
          document_type: string;
          file_name: string;
          file_path: string;
          id?: string;
          student_id: string;
          uploaded_by: string;
        };
        Update: {
          created_at?: string;
          document_type?: string;
          file_name?: string;
          file_path?: string;
          id?: string;
          student_id?: string;
          uploaded_by?: string;
        };
        Relationships: [
          {
            foreignKeyName: "student_documents_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
        ];
      };
      submissions: {
        Row: {
          assignment_id: string;
          comment: string | null;
          created_at: string;
          feedback: string | null;
          file_path: string | null;
          file_paths: string[];
          grade: string | null;
          id: string;
          status: string;
          student_id: string;
          submitted_at: string;
          updated_at: string;
        };
        Insert: {
          assignment_id: string;
          comment?: string | null;
          created_at?: string;
          feedback?: string | null;
          file_path?: string | null;
          file_paths?: string[];
          grade?: string | null;
          id?: string;
          status?: string;
          student_id: string;
          submitted_at?: string;
          updated_at?: string;
        };
        Update: {
          assignment_id?: string;
          comment?: string | null;
          created_at?: string;
          feedback?: string | null;
          file_path?: string | null;
          file_paths?: string[];
          grade?: string | null;
          id?: string;
          status?: string;
          student_id?: string;
          submitted_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "submissions_assignment_id_fkey";
            columns: ["assignment_id"];
            isOneToOne: false;
            referencedRelation: "assignments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "submissions_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
        ];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      claim_regulatory_deadline_reminders: {
        Args: { _channels?: string[] | null; _limit?: number };
        Returns: Database["public"]["Tables"]["regulatory_deadline_reminders"]["Row"][];
      };
      complete_regulatory_deadline_reminder: {
        Args: { _error?: string | null; _reminder_id: string; _sent: boolean };
        Returns: undefined;
      };
      heartbeat_presence: { Args: never; Returns: undefined };
      list_online_users: {
        Args: never;
        Returns: { last_seen_at: string; name: string; role: string }[];
      };
      log_auth_event: { Args: { _event: string }; Returns: undefined };
      remove_my_presence: { Args: never; Returns: undefined };
      create_cat_assessment: {
        Args: {
          _closes_at: string;
          _course_id: string;
          _download_file_name: string | null;
          _download_file_path: string | null;
          _duration_minutes: number;
          _instructions: string | null;
          _level_ids: string[];
          _name: string;
          _opens_at: string | null;
          _questions: Json;
          _title: string;
          _unit_id: string;
        };
        Returns: string;
      };
      create_targeted_cat_assessment: {
        Args: {
          _closes_at: string;
          _course_id: string;
          _download_file_name: string | null;
          _download_file_path: string | null;
          _duration_minutes: number;
          _instructions: string | null;
          _level_ids: string[];
          _name: string;
          _opens_at: string | null;
          _questions: Json;
          _student_ids: string[];
          _title: string;
          _unit_id: string;
        };
        Returns: string;
      };
      set_cat_assessment_unit: {
        Args: { _assessment_id: string; _unit_id: string };
        Returns: undefined;
      };
      save_cat_assessment_mark: {
        Args: { _assessment_id: string; _score: number; _student_number: string };
        Returns: undefined;
      };
      list_cat_mark_candidates: {
        Args: { _assessment_id: string };
        Returns: { student_name: string; student_number: string }[];
      };
      save_fee_balance_reminder_template: {
        Args: { _template: Json };
        Returns: undefined;
      };
      admin_fee_account_summary: {
        Args: never;
        Returns: {
          billed: number;
          first_name: string;
          last_name: string;
          paid: number;
          student_id: string;
          student_number: string;
        }[];
      };
      attach_application_document: {
        Args: {
          _application_id: string;
          _doc_type: string;
          _file_name: string;
          _file_path: string;
          _token: string;
        };
        Returns: undefined;
      };
      check_application_status: {
        Args: { _contact: string; _number: string };
        Returns: Json;
      };
      claim_first_super_admin: { Args: never; Returns: boolean };
      claim_student_record: { Args: never; Returns: string };
      can_access_online_lesson: { Args: { _lesson_id: string }; Returns: boolean };
      can_access_online_lesson_file: { Args: { _file_path: string }; Returns: boolean };
      create_facilitator_cat: {
        Args: {
          _closes_at: string;
          _download_file_name: string | null;
          _download_file_path: string | null;
          _duration_minutes: number;
          _instructions: string | null;
          _level_ids: string[];
          _name: string;
          _opens_at: string | null;
          _questions: Json;
          _title: string;
          _unit_id: string;
        };
        Returns: string;
      };
      facilitator_unit_permission: {
        Args: { _permission?: string | null; _unit_id: string; _user_id: string };
        Returns: boolean;
      };
      facilitator_can_message_student: {
        Args: { _student_id: string };
        Returns: boolean;
      };
      facilitator_can_access_student_unit: {
        Args: { _permission: string; _student_id: string; _unit_id: string };
        Returns: boolean;
      };
      get_or_create_facilitator_conversation: {
        Args: { _student_id: string };
        Returns: string;
      };
      get_or_create_student_conversation: { Args: never; Returns: string };
      get_admission_letter_data: {
        Args: { _course_id: string; _student_id: string };
        Returns: Json;
      };
      list_cat_assessments: { Args: never; Returns: Json };
      list_student_cat_results: {
        Args: { _student_id: string };
        Returns: {
          attempt_id: string;
          cat_name: string;
          course_title: string;
          level_name: string | null;
          max_score: number;
          score: number;
          submitted_at: string;
          unit_name: string;
        }[];
      };
      list_facilitator_cat_performance: { Args: { _unit_id: string }; Returns: Json };
      get_cat_answer_sheet_unit: { Args: { _assessment_id: string }; Returns: Json };
      list_my_cats: { Args: { _course_id?: string | null }; Returns: Json };
      my_course_ids: { Args: never; Returns: string[] };
      student_has_course_level: {
        Args: { _course_id: string; _level_ids: string[] | null };
        Returns: boolean;
      };
      admin_enroll_student_course: {
        Args: {
          _course_id: string;
          _intake_id: string | null;
          _level_id: string | null;
          _student_id: string;
        };
        Returns: string;
      };
      admin_save_application_unit_selections: {
        Args: { _application_id: string; _unit_ids: string[] };
        Returns: undefined;
      };
      admin_save_student_course_unit_selections: {
        Args: { _course_id: string; _student_id: string; _unit_ids: string[] };
        Returns: undefined;
      };
      save_application_unit_selections: {
        Args: { _application_id: string; _token: string; _unit_ids: string[] };
        Returns: undefined;
      };
      save_my_course_unit_selections: {
        Args: { _course_id: string; _unit_ids: string[] };
        Returns: undefined;
      };
      record_faq_search: {
        Args: { _bucket: number; _faq_id: string };
        Returns: undefined;
      };
      save_cat_answer: {
        Args: {
          _attempt_id: string;
          _question_id: string;
          _selected_option: string;
        };
        Returns: undefined;
      };
      save_my_kasneb_number: { Args: { _kasneb_number: string }; Returns: string };
      start_cat_attempt: { Args: { _assessment_id: string }; Returns: Json };
      submit_cat_attempt: { Args: { _attempt_id: string }; Returns: Json };
      list_faq_search_insights: {
        Args: { _days?: number };
        Returns: {
          category: string;
          faq_id: string;
          question: string;
          search_count: number;
        }[];
      };
      claim_due_progression_followups: {
        Args: { _limit?: number };
        Returns: {
          id: string;
          message: string;
          next_course: string;
          next_course_id: string;
          student_email: string;
          student_name: string;
          student_number: string;
          subject: string;
        }[];
      };
      enroll_application: { Args: { _application_id: string }; Returns: string };
      enroll_online_course: {
        Args: { _course_id: string; _phone: string };
        Returns: { enrollment_id: string; student_id: string; student_number: string }[];
      };
      complete_online_lesson: { Args: { _lesson_id: string }; Returns: undefined };
      has_any_role: {
        Args: {
          _roles: Database["public"]["Enums"]["app_role"][];
          _user_id: string;
        };
        Returns: boolean;
      };
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      is_staff: { Args: { _user_id: string }; Returns: boolean };
      list_staff: {
        Args: never;
        Returns: {
          created_at: string;
          email: string;
          full_name: string;
          roles: Database["public"]["Enums"]["app_role"][];
          status: string;
          user_id: string;
        }[];
      };
      list_online_course_lessons: {
        Args: { _course_id: string };
        Returns: {
          completed: boolean;
          description: string | null;
          duration_seconds: number;
          file_path: string | null;
          file_type: string | null;
          id: string;
          is_preview: boolean;
          locked: boolean;
          notes: string | null;
          section_title: string;
          sort_order: number;
          title: string;
          video_url: string | null;
        }[];
      };
      mark_assignment_submission: {
        Args: {
          _feedback: string | null;
          _grade: string;
          _score: number;
          _submission_id: string;
        };
        Returns: string;
      };
      list_student_progression_followups: {
        Args: never;
        Returns: {
          attempts: number;
          created_at: string;
          due_at: string;
          grade: string | null;
          id: string;
          last_error: string | null;
          next_course: string;
          score: number | null;
          sent_at: string | null;
          source_course: string;
          status: string;
          student_email: string;
          student_id: string;
          student_name: string;
          student_number: string;
          unit_name: string;
        }[];
      };
      log_action: {
        Args: {
          _action: string;
          _details?: Json;
          _entity: string;
          _entity_id: string;
        };
        Returns: undefined;
      };
      my_course_id: { Args: never; Returns: string };
      my_student_id: { Args: never; Returns: string };
      next_student_number: { Args: never; Returns: string };
      review_student_level_application: {
        Args: { _admin_message?: string | null; _application_id: string; _decision: string };
        Returns: undefined;
      };
      queue_existing_progression_followups: { Args: never; Returns: number };
      retry_progression_followup: { Args: { _followup_id: string }; Returns: undefined };
      set_role_by_email: {
        Args: {
          _email: string;
          _grant: boolean;
          _role: Database["public"]["Enums"]["app_role"];
        };
        Returns: undefined;
      };
      set_student_status: {
        Args: { _status: string; _student_id: string };
        Returns: undefined;
      };
      update_cat_assessment: {
        Args: {
          _assessment_id: string;
          _closes_at: string;
          _download_file_name: string | null;
          _download_file_path: string | null;
          _duration_minutes: number;
          _instructions: string | null;
          _name: string;
          _opens_at: string;
          _questions?: Json | null;
          _title: string;
        };
        Returns: undefined;
      };
      confirm_holiday_program_payment: {
        Args: {
          p_mpesa_receipt_number?: string | null;
          p_payment_id: string;
          p_verified_status: string;
        };
        Returns: undefined;
      };
      set_holiday_program_period_modules: {
        Args: { p_module_ids: string[]; p_period_id: string };
        Returns: undefined;
      };
      submit_application: { Args: { p: Json }; Returns: Json };
      submit_holiday_program_application: { Args: { p: Json }; Returns: string };
      submit_student_level_application: {
        Args: { _level_id: string; _message?: string | null };
        Returns: string;
      };
      super_admin_exists: { Args: never; Returns: boolean };
      update_my_contact: {
        Args: {
          _address: string;
          _alt_phone: string;
          _phone: string;
          _town: string;
        };
        Returns: undefined;
      };
    };
    Enums: {
      app_role:
        | "super_admin"
        | "admissions_admin"
        | "academic_admin"
        | "content_admin"
        | "student"
        | "facilitator";
      application_status:
        | "submitted"
        | "under_review"
        | "accepted"
        | "rejected"
        | "waitlisted"
        | "more_info_required"
        | "enrolled";
      article_status: "draft" | "published" | "scheduled";
      study_mode: "full_time" | "part_time" | "online";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "super_admin",
        "admissions_admin",
        "academic_admin",
        "content_admin",
        "student",
        "facilitator",
      ],
      application_status: [
        "submitted",
        "under_review",
        "accepted",
        "rejected",
        "waitlisted",
        "more_info_required",
        "enrolled",
      ],
      article_status: ["draft", "published", "scheduled"],
      study_mode: ["full_time", "part_time", "online"],
    },
  },
} as const;
