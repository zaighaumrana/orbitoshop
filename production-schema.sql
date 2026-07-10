--
-- PostgreSQL database dump
--

\restrict z5df4Bc6W1gzN49zfrZP7k84XLK3DK9n8BdeYHtuhRpBoZSl6RnDb1YL6u1bxgr

-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.4

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: pg_database_owner
--

CREATE SCHEMA public;


ALTER SCHEMA public OWNER TO pg_database_owner;

--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: pg_database_owner
--

COMMENT ON SCHEMA public IS 'standard public schema';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: active_sessions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.active_sessions (
    id bigint NOT NULL,
    employee_id text NOT NULL,
    session_key text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.active_sessions OWNER TO postgres;

--
-- Name: active_sessions_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.active_sessions ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.active_sessions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: attendance; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.attendance (
    id integer NOT NULL,
    employee_id integer,
    clock_in timestamp without time zone DEFAULT now() NOT NULL,
    clock_out timestamp without time zone,
    break_minutes integer DEFAULT 0,
    date date DEFAULT CURRENT_DATE NOT NULL,
    notes text DEFAULT ''::text,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.attendance OWNER TO postgres;

--
-- Name: attendance_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.attendance_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.attendance_id_seq OWNER TO postgres;

--
-- Name: attendance_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.attendance_id_seq OWNED BY public.attendance.id;


--
-- Name: employees; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.employees (
    id integer NOT NULL,
    name text NOT NULL,
    pin_code text,
    role text DEFAULT 'Cashier'::text,
    status text DEFAULT 'Active'::text,
    email text,
    password text
);


ALTER TABLE public.employees OWNER TO postgres;

--
-- Name: employees_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.employees_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.employees_id_seq OWNER TO postgres;

--
-- Name: employees_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.employees_id_seq OWNED BY public.employees.id;


--
-- Name: inventory; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.inventory (
    id integer NOT NULL,
    name text NOT NULL,
    sku text DEFAULT ''::text,
    category text DEFAULT 'General'::text,
    price numeric DEFAULT 0,
    cost numeric DEFAULT 0,
    qty integer DEFAULT 0,
    min_qty integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.inventory OWNER TO postgres;

--
-- Name: inventory_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.inventory_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.inventory_id_seq OWNER TO postgres;

--
-- Name: inventory_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.inventory_id_seq OWNED BY public.inventory.id;


--
-- Name: leaves; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.leaves (
    id integer NOT NULL,
    employee_id integer,
    leave_type text DEFAULT 'Casual'::text NOT NULL,
    from_date date NOT NULL,
    to_date date NOT NULL,
    reason text DEFAULT ''::text,
    status text DEFAULT 'Pending'::text NOT NULL,
    reviewed_by integer,
    reviewed_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.leaves OWNER TO postgres;

--
-- Name: leaves_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.leaves_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.leaves_id_seq OWNER TO postgres;

--
-- Name: leaves_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.leaves_id_seq OWNED BY public.leaves.id;


--
-- Name: password_reset_requests; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.password_reset_requests (
    id bigint NOT NULL,
    email text NOT NULL,
    status text DEFAULT 'Pending'::text NOT NULL,
    requested_at timestamp with time zone DEFAULT now(),
    resolved_at timestamp with time zone,
    resolved_by text
);


ALTER TABLE public.password_reset_requests OWNER TO postgres;

--
-- Name: password_reset_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.password_reset_requests ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.password_reset_requests_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: quick_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.quick_items (
    id integer NOT NULL,
    name text NOT NULL,
    prices jsonb DEFAULT '[]'::jsonb,
    sort_order integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.quick_items OWNER TO postgres;

--
-- Name: quick_items_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.quick_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.quick_items_id_seq OWNER TO postgres;

--
-- Name: quick_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.quick_items_id_seq OWNED BY public.quick_items.id;


--
-- Name: repair_components; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.repair_components (
    id integer NOT NULL,
    name text NOT NULL,
    sort_order integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.repair_components OWNER TO postgres;

--
-- Name: repair_components_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.repair_components_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.repair_components_id_seq OWNER TO postgres;

--
-- Name: repair_components_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.repair_components_id_seq OWNED BY public.repair_components.id;


--
-- Name: returns; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.returns (
    id integer NOT NULL,
    original_sale_id bigint,
    returned_items jsonb DEFAULT '[]'::jsonb,
    refund_amount numeric DEFAULT 0,
    processed_by integer,
    notes text DEFAULT ''::text,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.returns OWNER TO postgres;

--
-- Name: returns_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.returns_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.returns_id_seq OWNER TO postgres;

--
-- Name: returns_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.returns_id_seq OWNED BY public.returns.id;


--
-- Name: salary_config; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.salary_config (
    id integer NOT NULL,
    employee_id integer,
    salary_type text DEFAULT 'Monthly'::text NOT NULL,
    rate numeric DEFAULT 0 NOT NULL,
    effective_from date DEFAULT CURRENT_DATE,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.salary_config OWNER TO postgres;

--
-- Name: salary_config_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.salary_config_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.salary_config_id_seq OWNER TO postgres;

--
-- Name: salary_config_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.salary_config_id_seq OWNED BY public.salary_config.id;


--
-- Name: salary_slips; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.salary_slips (
    id integer NOT NULL,
    employee_id integer,
    month integer NOT NULL,
    year integer NOT NULL,
    days_in_month integer NOT NULL,
    days_present integer DEFAULT 0 NOT NULL,
    days_absent integer DEFAULT 0 NOT NULL,
    leaves_approved integer DEFAULT 0 NOT NULL,
    salary_type text NOT NULL,
    rate numeric NOT NULL,
    gross_salary numeric DEFAULT 0 NOT NULL,
    deductions numeric DEFAULT 0 NOT NULL,
    net_salary numeric DEFAULT 0 NOT NULL,
    notes text DEFAULT ''::text,
    generated_by integer,
    generated_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.salary_slips OWNER TO postgres;

--
-- Name: salary_slips_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.salary_slips_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.salary_slips_id_seq OWNER TO postgres;

--
-- Name: salary_slips_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.salary_slips_id_seq OWNED BY public.salary_slips.id;


--
-- Name: sales; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.sales (
    id bigint NOT NULL,
    ticket_id bigint,
    customer_name text DEFAULT ''::text,
    items_sold jsonb DEFAULT '[]'::jsonb,
    labour_cost numeric DEFAULT 0,
    discount numeric DEFAULT 0,
    discount_reason text DEFAULT ''::text,
    tax numeric DEFAULT 0,
    total_bill numeric DEFAULT 0,
    payment_method text DEFAULT 'Cash'::text,
    employee_id integer,
    employee_name text DEFAULT ''::text,
    created_at timestamp with time zone DEFAULT now(),
    cash_tendered numeric DEFAULT 0,
    change_given numeric DEFAULT 0
);


ALTER TABLE public.sales OWNER TO postgres;

--
-- Name: sales_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.sales ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.sales_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: shop_config; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.shop_config (
    id integer DEFAULT 1 NOT NULL,
    shop_name text DEFAULT 'FixPoint Mobile Care'::text,
    shop_address text DEFAULT ''::text,
    shop_phone text DEFAULT ''::text,
    shop_logo text DEFAULT ''::text,
    shop_description text DEFAULT ''::text,
    primary_color text DEFAULT '#126c5b'::text,
    secondary_color text DEFAULT '#e9b949'::text,
    currency text DEFAULT 'Rs.'::text,
    tax_rate numeric DEFAULT 0,
    strict_login_mode boolean DEFAULT false,
    discount_pin_required boolean DEFAULT true,
    partial_udhar_allowed boolean DEFAULT true,
    terms_text text DEFAULT 'Warranty: 30 days on parts replaced.'::text,
    repair_module_enabled boolean DEFAULT true,
    inventory_module_enabled boolean DEFAULT false,
    technician_module_enabled boolean DEFAULT true,
    suspended boolean DEFAULT false,
    platform_client_id integer,
    platform_url text,
    platform_anon text,
    billing_model text DEFAULT 'fixed'::text,
    per_receipt_rate numeric DEFAULT 0,
    override_pin text DEFAULT '1234'::text,
    per_ticket_rate numeric DEFAULT 10,
    per_item_rate numeric DEFAULT 1,
    owner_email text,
    owner_password text,
    workshop_enabled boolean DEFAULT false,
    live_tracking_enabled boolean DEFAULT false,
    ems_enabled boolean DEFAULT false,
    ems_track_breaks boolean DEFAULT false
);


ALTER TABLE public.shop_config OWNER TO postgres;

--
-- Name: tickets; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.tickets (
    id bigint NOT NULL,
    ticket_number text,
    customer_name text,
    customer_phone text,
    device_brand text,
    device_model text,
    imei text,
    components_noted jsonb DEFAULT '[]'::jsonb,
    estimated_quote numeric DEFAULT 0,
    advance_payment numeric DEFAULT 0,
    advance_method text DEFAULT ''::text,
    status text DEFAULT 'Pending'::text,
    technician_note text DEFAULT ''::text,
    decline_reason text DEFAULT ''::text,
    created_by text DEFAULT ''::text,
    created_at timestamp with time zone DEFAULT now(),
    settled_at timestamp with time zone,
    update_note text,
    actual_quote numeric DEFAULT 0,
    parts_used jsonb DEFAULT '[]'::jsonb,
    labour_cost numeric DEFAULT 0,
    final_price_override numeric,
    amount_paid numeric DEFAULT 0,
    balance_due numeric DEFAULT 0,
    payment_history jsonb DEFAULT '[]'::jsonb,
    is_locked boolean DEFAULT false,
    invoice_number text,
    final_total numeric DEFAULT 0,
    placed_at timestamp without time zone,
    collected_at timestamp without time zone,
    parent_ticket_id bigint
);


ALTER TABLE public.tickets OWNER TO postgres;

--
-- Name: tickets_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.tickets ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.tickets_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: udhar; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.udhar (
    id integer NOT NULL,
    sale_id bigint,
    customer_name text,
    customer_phone text,
    total_amount numeric DEFAULT 0,
    amount_paid numeric DEFAULT 0,
    balance_due numeric DEFAULT 0,
    payment_history jsonb DEFAULT '[]'::jsonb,
    status text DEFAULT 'Outstanding'::text,
    created_at timestamp with time zone DEFAULT now(),
    settled_at timestamp with time zone
);


ALTER TABLE public.udhar OWNER TO postgres;

--
-- Name: udhar_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.udhar_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.udhar_id_seq OWNER TO postgres;

--
-- Name: udhar_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.udhar_id_seq OWNED BY public.udhar.id;


--
-- Name: attendance id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance ALTER COLUMN id SET DEFAULT nextval('public.attendance_id_seq'::regclass);


--
-- Name: employees id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employees ALTER COLUMN id SET DEFAULT nextval('public.employees_id_seq'::regclass);


--
-- Name: inventory id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventory ALTER COLUMN id SET DEFAULT nextval('public.inventory_id_seq'::regclass);


--
-- Name: leaves id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.leaves ALTER COLUMN id SET DEFAULT nextval('public.leaves_id_seq'::regclass);


--
-- Name: quick_items id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.quick_items ALTER COLUMN id SET DEFAULT nextval('public.quick_items_id_seq'::regclass);


--
-- Name: repair_components id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.repair_components ALTER COLUMN id SET DEFAULT nextval('public.repair_components_id_seq'::regclass);


--
-- Name: returns id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.returns ALTER COLUMN id SET DEFAULT nextval('public.returns_id_seq'::regclass);


--
-- Name: salary_config id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.salary_config ALTER COLUMN id SET DEFAULT nextval('public.salary_config_id_seq'::regclass);


--
-- Name: salary_slips id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.salary_slips ALTER COLUMN id SET DEFAULT nextval('public.salary_slips_id_seq'::regclass);


--
-- Name: udhar id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.udhar ALTER COLUMN id SET DEFAULT nextval('public.udhar_id_seq'::regclass);


--
-- Name: active_sessions active_sessions_employee_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.active_sessions
    ADD CONSTRAINT active_sessions_employee_id_key UNIQUE (employee_id);


--
-- Name: active_sessions active_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.active_sessions
    ADD CONSTRAINT active_sessions_pkey PRIMARY KEY (id);


--
-- Name: attendance attendance_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_pkey PRIMARY KEY (id);


--
-- Name: employees employees_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_pkey PRIMARY KEY (id);


--
-- Name: inventory inventory_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventory
    ADD CONSTRAINT inventory_pkey PRIMARY KEY (id);


--
-- Name: leaves leaves_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.leaves
    ADD CONSTRAINT leaves_pkey PRIMARY KEY (id);


--
-- Name: password_reset_requests password_reset_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.password_reset_requests
    ADD CONSTRAINT password_reset_requests_pkey PRIMARY KEY (id);


--
-- Name: quick_items quick_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.quick_items
    ADD CONSTRAINT quick_items_pkey PRIMARY KEY (id);


--
-- Name: repair_components repair_components_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.repair_components
    ADD CONSTRAINT repair_components_pkey PRIMARY KEY (id);


--
-- Name: returns returns_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.returns
    ADD CONSTRAINT returns_pkey PRIMARY KEY (id);


--
-- Name: salary_config salary_config_employee_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.salary_config
    ADD CONSTRAINT salary_config_employee_id_key UNIQUE (employee_id);


--
-- Name: salary_config salary_config_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.salary_config
    ADD CONSTRAINT salary_config_pkey PRIMARY KEY (id);


--
-- Name: salary_slips salary_slips_employee_id_month_year_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.salary_slips
    ADD CONSTRAINT salary_slips_employee_id_month_year_key UNIQUE (employee_id, month, year);


--
-- Name: salary_slips salary_slips_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.salary_slips
    ADD CONSTRAINT salary_slips_pkey PRIMARY KEY (id);


--
-- Name: sales sales_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sales
    ADD CONSTRAINT sales_pkey PRIMARY KEY (id);


--
-- Name: shop_config shop_config_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.shop_config
    ADD CONSTRAINT shop_config_pkey PRIMARY KEY (id);


--
-- Name: tickets tickets_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_pkey PRIMARY KEY (id);


--
-- Name: tickets tickets_ticket_number_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_ticket_number_key UNIQUE (ticket_number);


--
-- Name: udhar udhar_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.udhar
    ADD CONSTRAINT udhar_pkey PRIMARY KEY (id);


--
-- Name: attendance attendance_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id);


--
-- Name: leaves leaves_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.leaves
    ADD CONSTRAINT leaves_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id);


--
-- Name: leaves leaves_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.leaves
    ADD CONSTRAINT leaves_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.employees(id);


--
-- Name: returns returns_original_sale_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.returns
    ADD CONSTRAINT returns_original_sale_id_fkey FOREIGN KEY (original_sale_id) REFERENCES public.sales(id);


--
-- Name: returns returns_processed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.returns
    ADD CONSTRAINT returns_processed_by_fkey FOREIGN KEY (processed_by) REFERENCES public.employees(id);


--
-- Name: salary_config salary_config_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.salary_config
    ADD CONSTRAINT salary_config_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id);


--
-- Name: salary_slips salary_slips_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.salary_slips
    ADD CONSTRAINT salary_slips_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id);


--
-- Name: salary_slips salary_slips_generated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.salary_slips
    ADD CONSTRAINT salary_slips_generated_by_fkey FOREIGN KEY (generated_by) REFERENCES public.employees(id);


--
-- Name: sales sales_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sales
    ADD CONSTRAINT sales_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id);


--
-- Name: sales sales_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sales
    ADD CONSTRAINT sales_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.tickets(id);


--
-- Name: tickets tickets_parent_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_parent_ticket_id_fkey FOREIGN KEY (parent_ticket_id) REFERENCES public.tickets(id);


--
-- Name: udhar udhar_sale_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.udhar
    ADD CONSTRAINT udhar_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES public.sales(id);


--
-- Name: active_sessions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.active_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: employees allow all; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "allow all" ON public.employees USING (true) WITH CHECK (true);


--
-- Name: inventory allow all; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "allow all" ON public.inventory USING (true) WITH CHECK (true);


--
-- Name: returns allow all; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "allow all" ON public.returns USING (true) WITH CHECK (true);


--
-- Name: sales allow all; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "allow all" ON public.sales USING (true) WITH CHECK (true);


--
-- Name: shop_config allow all; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "allow all" ON public.shop_config USING (true) WITH CHECK (true);


--
-- Name: tickets allow all; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "allow all" ON public.tickets USING (true) WITH CHECK (true);


--
-- Name: udhar allow all; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "allow all" ON public.udhar USING (true) WITH CHECK (true);


--
-- Name: password_reset_requests anon full access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "anon full access" ON public.password_reset_requests USING (true) WITH CHECK (true);


--
-- Name: active_sessions anon_access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY anon_access ON public.active_sessions USING (true) WITH CHECK (true);


--
-- Name: employees; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

--
-- Name: inventory; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;

--
-- Name: password_reset_requests; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.password_reset_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: returns; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.returns ENABLE ROW LEVEL SECURITY;

--
-- Name: sales; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;

--
-- Name: shop_config; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.shop_config ENABLE ROW LEVEL SECURITY;

--
-- Name: tickets; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

--
-- Name: udhar; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.udhar ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: pg_database_owner
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: TABLE active_sessions; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.active_sessions TO anon;
GRANT ALL ON TABLE public.active_sessions TO authenticated;
GRANT ALL ON TABLE public.active_sessions TO service_role;


--
-- Name: SEQUENCE active_sessions_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.active_sessions_id_seq TO anon;
GRANT ALL ON SEQUENCE public.active_sessions_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.active_sessions_id_seq TO service_role;


--
-- Name: TABLE attendance; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.attendance TO anon;
GRANT ALL ON TABLE public.attendance TO authenticated;
GRANT ALL ON TABLE public.attendance TO service_role;


--
-- Name: SEQUENCE attendance_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.attendance_id_seq TO anon;
GRANT ALL ON SEQUENCE public.attendance_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.attendance_id_seq TO service_role;


--
-- Name: TABLE employees; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.employees TO anon;
GRANT ALL ON TABLE public.employees TO authenticated;
GRANT ALL ON TABLE public.employees TO service_role;


--
-- Name: SEQUENCE employees_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.employees_id_seq TO anon;
GRANT ALL ON SEQUENCE public.employees_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.employees_id_seq TO service_role;


--
-- Name: TABLE inventory; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.inventory TO anon;
GRANT ALL ON TABLE public.inventory TO authenticated;
GRANT ALL ON TABLE public.inventory TO service_role;


--
-- Name: SEQUENCE inventory_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.inventory_id_seq TO anon;
GRANT ALL ON SEQUENCE public.inventory_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.inventory_id_seq TO service_role;


--
-- Name: TABLE leaves; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.leaves TO anon;
GRANT ALL ON TABLE public.leaves TO authenticated;
GRANT ALL ON TABLE public.leaves TO service_role;


--
-- Name: SEQUENCE leaves_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.leaves_id_seq TO anon;
GRANT ALL ON SEQUENCE public.leaves_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.leaves_id_seq TO service_role;


--
-- Name: TABLE password_reset_requests; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.password_reset_requests TO anon;
GRANT ALL ON TABLE public.password_reset_requests TO authenticated;
GRANT ALL ON TABLE public.password_reset_requests TO service_role;


--
-- Name: SEQUENCE password_reset_requests_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.password_reset_requests_id_seq TO anon;
GRANT ALL ON SEQUENCE public.password_reset_requests_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.password_reset_requests_id_seq TO service_role;


--
-- Name: TABLE quick_items; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.quick_items TO anon;
GRANT ALL ON TABLE public.quick_items TO authenticated;
GRANT ALL ON TABLE public.quick_items TO service_role;


--
-- Name: SEQUENCE quick_items_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.quick_items_id_seq TO anon;
GRANT ALL ON SEQUENCE public.quick_items_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.quick_items_id_seq TO service_role;


--
-- Name: TABLE repair_components; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.repair_components TO anon;
GRANT ALL ON TABLE public.repair_components TO authenticated;
GRANT ALL ON TABLE public.repair_components TO service_role;


--
-- Name: SEQUENCE repair_components_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.repair_components_id_seq TO anon;
GRANT ALL ON SEQUENCE public.repair_components_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.repair_components_id_seq TO service_role;


--
-- Name: TABLE returns; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.returns TO anon;
GRANT ALL ON TABLE public.returns TO authenticated;
GRANT ALL ON TABLE public.returns TO service_role;


--
-- Name: SEQUENCE returns_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.returns_id_seq TO anon;
GRANT ALL ON SEQUENCE public.returns_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.returns_id_seq TO service_role;


--
-- Name: TABLE salary_config; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.salary_config TO anon;
GRANT ALL ON TABLE public.salary_config TO authenticated;
GRANT ALL ON TABLE public.salary_config TO service_role;


--
-- Name: SEQUENCE salary_config_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.salary_config_id_seq TO anon;
GRANT ALL ON SEQUENCE public.salary_config_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.salary_config_id_seq TO service_role;


--
-- Name: TABLE salary_slips; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.salary_slips TO anon;
GRANT ALL ON TABLE public.salary_slips TO authenticated;
GRANT ALL ON TABLE public.salary_slips TO service_role;


--
-- Name: SEQUENCE salary_slips_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.salary_slips_id_seq TO anon;
GRANT ALL ON SEQUENCE public.salary_slips_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.salary_slips_id_seq TO service_role;


--
-- Name: TABLE sales; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.sales TO anon;
GRANT ALL ON TABLE public.sales TO authenticated;
GRANT ALL ON TABLE public.sales TO service_role;


--
-- Name: SEQUENCE sales_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.sales_id_seq TO anon;
GRANT ALL ON SEQUENCE public.sales_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.sales_id_seq TO service_role;


--
-- Name: TABLE shop_config; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.shop_config TO anon;
GRANT ALL ON TABLE public.shop_config TO authenticated;
GRANT ALL ON TABLE public.shop_config TO service_role;


--
-- Name: TABLE tickets; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.tickets TO anon;
GRANT ALL ON TABLE public.tickets TO authenticated;
GRANT ALL ON TABLE public.tickets TO service_role;


--
-- Name: SEQUENCE tickets_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.tickets_id_seq TO anon;
GRANT ALL ON SEQUENCE public.tickets_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.tickets_id_seq TO service_role;


--
-- Name: TABLE udhar; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.udhar TO anon;
GRANT ALL ON TABLE public.udhar TO authenticated;
GRANT ALL ON TABLE public.udhar TO service_role;


--
-- Name: SEQUENCE udhar_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.udhar_id_seq TO anon;
GRANT ALL ON SEQUENCE public.udhar_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.udhar_id_seq TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- PostgreSQL database dump complete
--

\unrestrict z5df4Bc6W1gzN49zfrZP7k84XLK3DK9n8BdeYHtuhRpBoZSl6RnDb1YL6u1bxgr

