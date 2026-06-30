import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";

const API_BASE =
  import.meta.env.VITE_API_BASE_URL ??
  (window.location.port === "5173" ? "http://127.0.0.1:8000" : window.location.origin);
const PORTADA_IMAGE = "/imagenes/portada.png";
const LOGO_TEMA_IMAGE = "/imagenes/logo-tema.png";
const MAX_UPLOAD_FILE_SIZE_MB = 1024;
const MAX_UPLOAD_FILE_SIZE_BYTES = MAX_UPLOAD_FILE_SIZE_MB * 1024 * 1024;
const MAX_UPLOAD_FILES_PER_REQUEST = 10;

type ConfigItem = {
  key: string;
  label: string;
  value?: string | null;
  required: boolean;
  configured: boolean;
  help_text: string;
};

type ConfigOverview = {
  company_name: string;
  theme: string;
  preferred_surface: string;
  deployment_target: string;
  items: ConfigItem[];
};

type AccessPolicy = {
  company_name: string;
  require_corporate_email: boolean;
  allowed_domains: string[];
  identity_provider: string;
  login_message: string;
  require_two_factor: boolean;
};

type Capability = {
  tool: string;
  title: string;
  description: string;
  examples: string[];
};

type Artifact = {
  id: string;
  name: string;
  kind: string;
  size: number;
  download_url?: string | null;
};

type ChatResponse = {
  job_id: string;
  tool_name: string;
  reply: string;
  steps: string[];
  artifacts: Artifact[];
  data: Record<string, unknown>;
  requires_confirmation: boolean;
};

type LoginResponse = {
  success: boolean;
  message: string;
  email: string;
  domain?: string | null;
  user_name?: string | null;
  session_token?: string | null;
  is_admin: boolean;
  requires_two_factor: boolean;
  challenge_id?: string | null;
  masked_destination?: string | null;
};

type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  two_factor_enabled: boolean;
  created_at?: string | null;
  updated_at?: string | null;
};

type AdminUserDraft = {
  name: string;
  email: string;
  role: string;
  active: boolean;
  two_factor_enabled: boolean;
};

type CorporateEndpoint = {
  id: string;
  name: string;
  base_url?: string | null;
  auth_method?: string | null;
  owner?: string | null;
  pii_scope?: string | null;
  enabled: boolean;
};

type AdminAppSettings = {
  app_name: string;
  company_name: string;
  company_industry: string;
  preferred_surface: string;
  deployment_target: string;
  corporate_identity_provider: string;
  require_corporate_email: boolean;
  allowed_domains: string[];
  require_two_factor: boolean;
  corporate_api_base_url?: string | null;
  corporate_api_auth_method?: string | null;
  corporate_api_key_endpoints?: string | null;
  data_restrictions?: string | null;
  pii_policy?: string | null;
  retention_policy?: string | null;
  approved_gen_ai_provider?: string | null;
  anthropic_api_key?: string | null;
  enable_anthropic_routing: boolean;
  gen_image_api_provider?: string | null;
  gen_video_api_provider?: string | null;
  gen_api_budget_monthly?: string | null;
  gen_api_budget_alert_threshold?: string | null;
  office_graph_tenant_id?: string | null;
  office_graph_client_id?: string | null;
  office_graph_client_secret?: string | null;
  admin_user_emails: string[];
  allowed_origins: string[];
  storage_dir: string;
  audit_dir: string;
  mock_corporate_data: boolean;
  phase1_priority_use_cases: string;
  observability_notes?: string | null;
  corporate_endpoints: CorporateEndpoint[];
};

type AdminAppSettingsDraft = Omit<AdminAppSettings, "allowed_domains" | "admin_user_emails" | "allowed_origins"> & {
  allowed_domains_text: string;
  admin_user_emails_text: string;
  allowed_origins_text: string;
};

type ApiErrorPayload = {
  detail?: string;
  message?: string;
};

type WorkspaceSection = "inicio" | "operacion" | "modulos" | "archivos" | "admin";

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionWindow = Window &
  typeof globalThis & {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };

const starterPrompts = [
  "Muéstrame los servicios medioambientales disponibles",
  "Crea una presentación comercial de Tema Litoclean",
  "Parte el PDF cargado en páginas individuales",
  "Genera un formulario de inspección ambiental",
  "Consolida y deduplica los Excel de monitoreo cargados",
  "Compara los resultados de agua cargados contra los umbrales ECA",
  "Genera un informe trimestral de monitoreo ambiental con los datos cargados",
  "Quita los folios del área inferior derecha desde la página 1 hasta la página 2",
];

const sectionMeta: Array<{ id: WorkspaceSection; label: string; description: string }> = [
  { id: "inicio", label: "Inicio", description: "Resumen operativo y accesos rápidos" },
  { id: "operacion", label: "Operación", description: "Ejecución del agente y resultados" },
  { id: "modulos", label: "Módulos", description: "Catálogo funcional para escalar la plataforma" },
  { id: "archivos", label: "Archivos", description: "Carga documental y artefactos generados" },
  { id: "admin", label: "Administración", description: "Usuarios y configuración corporativa" },
];

const pdfWorkflowCards = [
  {
    badge: "PDF empresarial",
    title: "Partir por páginas",
    description: "Genera un PDF por cada página para revisión, distribución o archivo por expediente.",
    prompt: "Parte el PDF cargado en páginas individuales",
  },
  {
    badge: "PDF empresarial",
    title: "Partir por secciones",
    description: "Separa anexos, capítulos o bloques operativos usando rangos o cantidad de secciones.",
    prompt: "Divide el PDF cargado en secciones 1-5, 6-10 y 11-15",
  },
  {
    badge: "Auditoría",
    title: "Extraer rango útil",
    description: "Recorta solo las páginas necesarias para auditoría, revisión legal o envío al cliente.",
    prompt: "Extrae las páginas 3 a 8 del PDF cargado",
  },
  {
    badge: "Control documental",
    title: "Quitar folios",
    description: "Limpia numeración o textos repetidos en zonas fijas del documento.",
    prompt: "Quita los folios del área inferior derecha desde la página 1 hasta la página 5",
  },
  {
    badge: "Seguridad",
    title: "Marca de agua",
    description: "Protege copias internas con sello auditado para circulación controlada.",
    prompt: "Aplica marca de agua a los PDFs cargados",
  },
  {
    badge: "Expedientes",
    title: "Unificar lote",
    description: "Combina varios PDFs en un solo entregable para licitaciones, contratos o informes.",
    prompt: "Combina los PDFs cargados en un solo archivo",
  },
] as const;

const specializedConversationPrompts = [
  "Analiza este requerimiento y reutiliza primero lo que ya existe en Laravel",
  "Evalúa si el flujo de aprobaciones multinivel ya existe y si no propón backend y frontend",
  "Divide el PDF cargado en 3 secciones para anexos operativos",
  "Extrae las páginas 2 a 6 del PDF cargado para revisión legal",
  "Genera un reporte Word de hallazgos para auditoría medioambiental",
  "Prepara un Excel con indicadores operativos y columnas de seguimiento",
] as const;

const moduleSpotlights = [
  {
    badge: "Documento",
    title: "PDF empresarial especializado",
    description: "Parte documentos por páginas o secciones, extrae rangos, limpia folios y protege copias.",
    prompt: "Divide el PDF cargado en secciones 1-5, 6-10 y 11-15",
  },
  {
    badge: "Lenguaje natural",
    title: "Comunicación natural especializada",
    description: "Entiende requerimientos técnicos y decide si reutiliza módulos existentes o propone extensiones.",
    prompt: "Evalúa si ya existe un módulo para trazabilidad documental y si no propónlo para backend y frontend",
  },
  {
    badge: "Productividad",
    title: "Ofimática corporativa",
    description: "Genera Word, Excel y PowerPoint para operaciones, comercial, auditoría y gerencia.",
    prompt: "Crea una presentación ejecutiva de servicios de Tema Litoclean",
  },
  {
    badge: "Operación",
    title: "Datos y formularios",
    description: "Conecta datos corporativos y estructuras de captura para procesos internos escalables.",
    prompt: "Genera un formulario de inspección ambiental con campos obligatorios y trazabilidad",
  },
] as const;

const premiumWorkflowCards = [
  {
    badge: "Premium · Excel",
    title: "Consolidar Excels de monitoreo",
    description:
      "Une varios .xlsx/.csv (laboratorio, monitoreos) en un libro consolidado con hoja Consolidado, Resumen y deduplicación opcional. 100% PHP, sin IA.",
    prompt: "Consolida y deduplica los Excel de monitoreo cargados",
    acceptsFiles: true,
  },
  {
    badge: "Premium · ECA/LMP",
    title: "Comparar contra umbrales ambientales",
    description:
      "Cruza mediciones de agua, aire o ruido contra umbrales ECA/LMP referenciales y marca CUMPLE / EXCEDE / SIN_UMBRAL. Valores referenciales: valida contra la norma vigente.",
    prompt: "Compara los resultados de agua cargados contra los umbrales ECA",
    acceptsFiles: true,
  },
  {
    badge: "Premium · Informe",
    title: "Generar informe profesional",
    description:
      "Produce un informe ambiental DOCX con portada, índice, metodología, resultados y conclusiones. Narrativa con IA solo si está habilitada; si no, plantillas deterministas.",
    prompt: "Genera un informe trimestral de monitoreo ambiental para el cliente con los datos cargados",
    acceptsFiles: true,
  },
] as const;

function buildPdfReadingInstruction(prompt: string): string {
  const cleanPrompt =
    prompt.trim() || "Resume el documento e identifica hallazgos, riesgos, responsables y siguientes acciones.";
  return (
    "Lee el PDF cargado. Primero extrae el contenido a Markdown estructurado para el modelo. " +
    "Luego responde a esta solicitud del usuario:\n[INSTRUCCION_USUARIO]\n" +
    cleanPrompt
  );
}

function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
  }

  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(0)} KB`;
  }

  return `${bytes} B`;
}

async function parseJsonResponse<T>(response: Response): Promise<T | null> {
  const raw = await response.text();
  if (!raw.trim()) {
    return null;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error("El servidor devolvió una respuesta no válida.");
  }
}

function getErrorMessage(payload: ApiErrorPayload | null, fallback: string): string {
  return payload?.detail ?? payload?.message ?? fallback;
}

function buildDownloadUrl(downloadUrl?: string | null): string {
  if (!downloadUrl) {
    return "#";
  }
  if (downloadUrl.startsWith("http://") || downloadUrl.startsWith("https://")) {
    return downloadUrl;
  }
  return `${API_BASE}${downloadUrl}`;
}

function createEndpointDraft(): CorporateEndpoint {
  return {
    id: `endpoint-${Math.random().toString(36).slice(2, 10)}`,
    name: "",
    base_url: "",
    auth_method: "",
    owner: "",
    pii_scope: "",
    enabled: true,
  };
}

function createAdminUserDraft(): AdminUserDraft {
  return {
    name: "",
    email: "",
    role: "analista",
    active: true,
    two_factor_enabled: true,
  };
}

function getAdminRoleLabel(role: string): string {
  return (
    {
      admin: "Administrador",
      analista: "Analista",
      operaciones: "Operaciones",
      auditoria: "Auditoría",
    }[role] ?? role
  );
}

function formatDateTime(value?: string | null): string {
  if (!value) {
    return "Sin registro";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("es-PE", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(parsed);
}

function toSettingsDraft(settings: AdminAppSettings): AdminAppSettingsDraft {
  return {
    ...settings,
    allowed_domains_text: settings.allowed_domains.join(", "),
    admin_user_emails_text: settings.admin_user_emails.join(", "),
    allowed_origins_text: settings.allowed_origins.join(", "),
    corporate_endpoints:
      settings.corporate_endpoints.length > 0 ? settings.corporate_endpoints : [createEndpointDraft()],
  };
}

function App() {
  const [config, setConfig] = useState<ConfigOverview | null>(null);
  const [policy, setPolicy] = useState<AccessPolicy | null>(null);
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [message, setMessage] = useState(starterPrompts[0]);
  const [pdfReadingPrompt, setPdfReadingPrompt] = useState(
    "Resume el documento, identifica riesgos, responsables, fechas clave y siguientes acciones.",
  );
  const [uploadedFiles, setUploadedFiles] = useState<Artifact[]>([]);
  const [result, setResult] = useState<ChatResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginMessage, setLoginMessage] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [twoFactorError, setTwoFactorError] = useState<string | null>(null);
  const [twoFactorLoading, setTwoFactorLoading] = useState(false);
  const [pendingLogin, setPendingLogin] = useState<LoginResponse | null>(null);
  const [session, setSession] = useState<LoginResponse | null>(null);
  const [activeSection, setActiveSection] = useState<WorkspaceSection>("inicio");
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminForm, setAdminForm] = useState<AdminUserDraft>(createAdminUserDraft());
  const [editingAdminUserId, setEditingAdminUserId] = useState<string | null>(null);
  const [adminUserSearch, setAdminUserSearch] = useState("");
  const [adminRoleFilter, setAdminRoleFilter] = useState("todos");
  const [adminStatusFilter, setAdminStatusFilter] = useState("todos");
  const [adminError, setAdminError] = useState<string | null>(null);
  const [adminMessage, setAdminMessage] = useState<string | null>(null);
  const [appSettings, setAppSettings] = useState<AdminAppSettings | null>(null);
  const [appSettingsDraft, setAppSettingsDraft] = useState<AdminAppSettingsDraft | null>(null);
  const [appSettingsLoading, setAppSettingsLoading] = useState(false);
  const [appSettingsSaving, setAppSettingsSaving] = useState(false);
  const [appSettingsError, setAppSettingsError] = useState<string | null>(null);
  const [appSettingsMessage, setAppSettingsMessage] = useState<string | null>(null);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const speechRecognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const loadInitialData = async () => {
    const [configResponse, capabilitiesResponse, policyResponse] = await Promise.all([
      fetch(`${API_BASE}/api/config`),
      fetch(`${API_BASE}/api/capabilities`),
      fetch(`${API_BASE}/api/auth/policy`),
    ]);
    if (!configResponse.ok || !capabilitiesResponse.ok || !policyResponse.ok) {
      throw new Error("No se pudieron cargar los datos iniciales de la aplicación.");
    }
    const [configPayload, capabilitiesPayload, policyPayload] = await Promise.all([
      parseJsonResponse<ConfigOverview>(configResponse),
      parseJsonResponse<Capability[]>(capabilitiesResponse),
      parseJsonResponse<AccessPolicy>(policyResponse),
    ]);
    if (!configPayload || !capabilitiesPayload || !policyPayload) {
      throw new Error("La API devolvió una respuesta vacía durante la carga inicial.");
    }
    setConfig(configPayload);
    setCapabilities(capabilitiesPayload);
    setPolicy(policyPayload);
  };

  const loadAdminUsers = async () => {
    setAdminLoading(true);
    setAdminError(null);
    try {
      const response = await fetch(`${API_BASE}/api/admin/users`);
      if (!response.ok) {
        throw new Error("No se pudo cargar el panel de usuarios.");
      }
      const payload = await parseJsonResponse<AdminUser[]>(response);
      setAdminUsers(payload ?? []);
    } catch (adminLoadError) {
      setAdminError(adminLoadError instanceof Error ? adminLoadError.message : "Error al cargar usuarios.");
    } finally {
      setAdminLoading(false);
    }
  };

  const loadAdminAppSettings = async () => {
    setAppSettingsLoading(true);
    setAppSettingsError(null);
    try {
      const response = await fetch(`${API_BASE}/api/admin/app-settings`);
      if (!response.ok) {
        throw new Error("No se pudo cargar la configuración administrable del App.");
      }
      const payload = await parseJsonResponse<AdminAppSettings>(response);
      if (!payload) {
        throw new Error("La API no devolvió la configuración del App.");
      }
      setAppSettings(payload);
      setAppSettingsDraft(toSettingsDraft(payload));
    } catch (settingsLoadError) {
      setAppSettingsError(
        settingsLoadError instanceof Error ? settingsLoadError.message : "Error al cargar la configuración.",
      );
    } finally {
      setAppSettingsLoading(false);
    }
  };

  useEffect(() => {
    loadInitialData().catch((loadError) => {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "No se pudo conectar con el backend. Verifica que Laravel esté corriendo.",
      );
    });
  }, []);

  useEffect(() => {
    const speechWindow = window as SpeechRecognitionWindow;
    setSpeechSupported(Boolean(speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition));
  }, []);

  useEffect(() => {
    return () => {
      speechRecognitionRef.current?.stop();
    };
  }, []);

  useEffect(() => {
    if (session?.is_admin) {
      void Promise.all([loadAdminUsers(), loadAdminAppSettings()]);
      return;
    }
    setAdminUsers([]);
    setAdminMessage(null);
    setAppSettings(null);
    setAppSettingsDraft(null);
    setAppSettingsError(null);
    setAppSettingsMessage(null);
  }, [session]);

  const pendingConfig = useMemo(() => config?.items.filter((item) => !item.configured).length ?? 0, [config]);
  const configuredConfig = useMemo(() => config?.items.filter((item) => item.configured).length ?? 0, [config]);
  const configCompletion = useMemo(() => {
    if (!config || config.items.length === 0) {
      return 0;
    }
    return Math.round((configuredConfig / config.items.length) * 100);
  }, [config, configuredConfig]);
  const corporateDomainHint = useMemo(
    () => policy?.allowed_domains.map((domain) => `@${domain}`).join(", ") ?? "",
    [policy],
  );
  const enabledEndpoints = useMemo(
    () => appSettings?.corporate_endpoints.filter((endpoint) => endpoint.enabled).length ?? 0,
    [appSettings],
  );
  const editableConfigBlocks = useMemo(
    () => [
      "Identidad del App",
      "Acceso corporativo",
      "Gobierno de datos",
      "IA generativa",
      "Microsoft 365",
      "Infraestructura",
      "Integraciones",
    ],
    [],
  );
  const recentArtifacts = result?.artifacts ?? [];
  const currentSection = sectionMeta.find((section) => section.id === activeSection) ?? sectionMeta[0];
  const visibleSections = sectionMeta.filter((section) => section.id !== "admin" || session?.is_admin);
  const uploadedPdfCount = useMemo(
    () =>
      uploadedFiles.filter(
        (file) => file.name.toLowerCase().endsWith(".pdf") || file.kind.toLowerCase().includes("pdf"),
      ).length,
    [uploadedFiles],
  );
  const capabilityHighlights = useMemo(
    () =>
      capabilities.map((capability) => ({
        ...capability,
        quickLabel:
          capability.tool === "pdf_batch"
            ? "PDF y documentos"
            : capability.tool === "office"
              ? "Office corporativo"
              : capability.tool === "corporate_data"
                ? "Datos corporativos"
                : capability.tool === "forms"
                  ? "Formularios"
                  : capability.tool === "solution_evolution"
                    ? "Comunicacion natural"
                  : "IA y media",
      })),
    [capabilities],
  );
  const adminRoleOptions = useMemo(
    () => [
      { value: "analista", label: "Analista" },
      { value: "operaciones", label: "Operaciones" },
      { value: "auditoria", label: "Auditoría" },
      { value: "admin", label: "Administrador" },
    ],
    [],
  );
  const filteredAdminUsers = useMemo(() => {
    const search = adminUserSearch.trim().toLowerCase();

    return adminUsers.filter((user) => {
      const matchesSearch =
        search.length === 0 ||
        user.name.toLowerCase().includes(search) ||
        user.email.toLowerCase().includes(search) ||
        getAdminRoleLabel(user.role).toLowerCase().includes(search);
      const matchesRole = adminRoleFilter === "todos" || user.role === adminRoleFilter;
      const matchesStatus =
        adminStatusFilter === "todos" ||
        (adminStatusFilter === "activos" && user.active) ||
        (adminStatusFilter === "inactivos" && !user.active) ||
        (adminStatusFilter === "2fa" && user.two_factor_enabled);

      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [adminRoleFilter, adminStatusFilter, adminUserSearch, adminUsers]);
  const activeAdminUsers = useMemo(() => adminUsers.filter((user) => user.active).length, [adminUsers]);
  const adminUsersWithTwoFactor = useMemo(
    () => adminUsers.filter((user) => user.two_factor_enabled).length,
    [adminUsers],
  );
  const adminAdministrators = useMemo(() => adminUsers.filter((user) => user.role === "admin").length, [adminUsers]);

  const submitPrompt = async (requestMessage: string, nextSection: WorkspaceSection = "operacion") => {
    const cleanMessage = requestMessage.trim();
    if (cleanMessage.length < 3) {
      setError("Describe la solicitud con mayor detalle.");
      setActiveSection(nextSection);
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(cleanMessage);
    setActiveSection(nextSection);

    try {
      const response = await fetch(`${API_BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: cleanMessage,
          uploaded_file_ids: uploadedFiles.map((file) => file.id),
        }),
      });
      const payload = await parseJsonResponse<ChatResponse & ApiErrorPayload>(response);
      if (!response.ok) {
        throw new Error(getErrorMessage(payload as unknown as ApiErrorPayload, "La orquestación falló. Revisa el backend."));
      }
      if (!payload) {
        throw new Error("La API no devolvió resultado para la consulta.");
      }
      setResult(payload);
      setActiveSection("operacion");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Error al consultar el agente.");
    } finally {
      setLoading(false);
    }
  };

  const handlePromptShortcut = (prompt: string, nextSection: WorkspaceSection = "operacion", autoRun = true) => {
    setMessage(prompt);
    setActiveSection(nextSection);

    if (autoRun && !loading) {
      void submitPrompt(prompt, nextSection);
    }
  };

  const handlePreparePdfReading = () => {
    handlePromptShortcut(buildPdfReadingInstruction(pdfReadingPrompt));
  };

  const handleStartVoicePrompt = () => {
    const speechWindow = window as SpeechRecognitionWindow;
    const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setSpeechError("Tu navegador no soporta dictado por voz en esta demo.");
      return;
    }

    speechRecognitionRef.current?.stop();
    const recognition = new Recognition();
    recognition.lang = "es-ES";
    recognition.interimResults = true;
    recognition.continuous = false;

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? "")
        .join(" ")
        .trim();
      if (transcript) {
        setPdfReadingPrompt(transcript);
      }
    };

    recognition.onerror = (event) => {
      setSpeechError(event.error ? `No se pudo capturar la voz: ${event.error}.` : "No se pudo capturar la voz.");
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    speechRecognitionRef.current = recognition;
    setSpeechError(null);
    setIsListening(true);
    recognition.start();
  };

  const handleStopVoicePrompt = () => {
    speechRecognitionRef.current?.stop();
    setIsListening(false);
  };

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) {
      return;
    }

    if (files.length > MAX_UPLOAD_FILES_PER_REQUEST) {
      setError(`Se permite un máximo de ${MAX_UPLOAD_FILES_PER_REQUEST} archivos por solicitud.`);
      event.target.value = "";
      return;
    }

    const oversized = Array.from(files).find((file) => file.size > MAX_UPLOAD_FILE_SIZE_BYTES);
    if (oversized) {
      setError(`El archivo "${oversized.name}" supera el límite de ${MAX_UPLOAD_FILE_SIZE_MB} MB.`);
      event.target.value = "";
      return;
    }

    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      Array.from(files).forEach((file) => formData.append("files", file));
      const response = await fetch(`${API_BASE}/api/files/upload`, {
        method: "POST",
        body: formData,
      });
      const payload = await parseJsonResponse<Artifact[] & ApiErrorPayload>(response);
      if (!response.ok) {
        throw new Error(getErrorMessage(payload as unknown as ApiErrorPayload, "No se pudieron subir los archivos."));
      }
      const data = payload ?? [];
      setUploadedFiles((current) => [...current, ...data]);
      setActiveSection("archivos");
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Error al subir archivos.");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    await submitPrompt(message);
  };

  const requestCorporateLogin = async (mode: "login" | "activate_2fa" = "login") => {
    setLoginError(null);
    setLoginMessage(null);
    setLoginLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: loginEmail,
          password: loginPassword,
        }),
      });
      const payload = await parseJsonResponse<LoginResponse & ApiErrorPayload>(response);
      if (!response.ok) {
        throw new Error(getErrorMessage(payload, "No fue posible validar el acceso corporativo."));
      }
      if (!payload) {
        throw new Error("La API no devolvió datos para el inicio de sesión.");
      }
      if (payload.requires_two_factor) {
        setPendingLogin(payload);
        setTwoFactorCode("");
        setTwoFactorError(null);
        setLoginMessage(
          mode === "activate_2fa"
            ? "Código de doble autenticación generado. Revisa el panel de validación."
            : null,
        );
        return;
      }

      if (mode === "activate_2fa") {
        throw new Error(
          policy?.require_two_factor
            ? "La doble autenticación no está habilitada para este usuario."
            : "La doble autenticación global está desactivada en la configuración del App.",
        );
      }

      setSession(payload);
    } catch (loginFailure) {
      setLoginError(loginFailure instanceof Error ? loginFailure.message : "Error de autenticación.");
    } finally {
      setLoginLoading(false);
    }
  };

  const handleCorporateLogin = async (event: FormEvent) => {
    event.preventDefault();
    await requestCorporateLogin("login");
  };

  const handleActivationCodeRequest = async () => {
    await requestCorporateLogin("activate_2fa");
  };

  const handleTwoFactor = async (event: FormEvent) => {
    event.preventDefault();
    if (!pendingLogin?.challenge_id) {
      return;
    }
    setTwoFactorError(null);
    setTwoFactorLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/auth/verify-2fa`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challenge_id: pendingLogin.challenge_id,
          code: twoFactorCode,
        }),
      });
      const payload = await parseJsonResponse<LoginResponse & ApiErrorPayload>(response);
      if (!response.ok) {
        throw new Error(getErrorMessage(payload, "No fue posible validar el segundo factor."));
      }
      if (!payload) {
        throw new Error("La API no devolvió datos para la doble autenticación.");
      }
      setPendingLogin(null);
      setSession(payload);
      setTwoFactorCode("");
    } catch (twoFactorFailure) {
      setTwoFactorError(
        twoFactorFailure instanceof Error ? twoFactorFailure.message : "Error en la doble autenticación.",
      );
    } finally {
      setTwoFactorLoading(false);
    }
  };

  const handleCreateUser = async (event: FormEvent) => {
    event.preventDefault();
    setAdminError(null);
    setAdminMessage(null);
    try {
      const response = await fetch(`${API_BASE}/api/admin/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(adminForm),
      });
      const payload = await parseJsonResponse<AdminUser & ApiErrorPayload>(response);
      if (!response.ok) {
        throw new Error(getErrorMessage(payload, "No fue posible crear el usuario."));
      }
      if (!payload) {
        throw new Error("La API no devolvió el usuario creado.");
      }
      setAdminForm(createAdminUserDraft());
      setEditingAdminUserId(null);
      setAdminMessage("Usuario registrado correctamente.");
      await loadAdminUsers();
    } catch (createError) {
      setAdminError(createError instanceof Error ? createError.message : "Error al crear usuario.");
    }
  };

  const handleAdminFormChange = (field: keyof AdminUserDraft, value: string | boolean) => {
    setAdminForm((current) => ({ ...current, [field]: value }));
  };

  const handleEditAdminUser = (user: AdminUser) => {
    setEditingAdminUserId(user.id);
    setAdminError(null);
    setAdminMessage(`Editando a ${user.name}.`);
    setAdminForm({
      name: user.name,
      email: user.email,
      role: user.role,
      active: user.active,
      two_factor_enabled: user.two_factor_enabled,
    });
  };

  const handleCancelAdminEdit = () => {
    setEditingAdminUserId(null);
    setAdminMessage(null);
    setAdminError(null);
    setAdminForm(createAdminUserDraft());
  };

  const handleSaveAdminUser = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingAdminUserId) {
      await handleCreateUser(event);
      return;
    }

    setAdminError(null);
    setAdminMessage(null);
    try {
      const response = await fetch(`${API_BASE}/api/admin/users/${editingAdminUserId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(adminForm),
      });
      const payload = await parseJsonResponse<AdminUser & ApiErrorPayload>(response);
      if (!response.ok) {
        throw new Error(getErrorMessage(payload, "No fue posible guardar el usuario."));
      }
      if (!payload) {
        throw new Error("La API no devolvió el usuario actualizado.");
      }
      setAdminUsers((current) => current.map((item) => (item.id === payload.id ? payload : item)));
      setAdminMessage("Usuario actualizado correctamente.");
      setEditingAdminUserId(null);
      setAdminForm(createAdminUserDraft());
    } catch (updateError) {
      setAdminError(updateError instanceof Error ? updateError.message : "Error al actualizar usuario.");
    }
  };

  const handleAdminToggle = async (user: AdminUser, field: "active" | "two_factor_enabled") => {
    setAdminError(null);
    setAdminMessage(null);
    try {
      const response = await fetch(`${API_BASE}/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: !user[field] }),
      });
      const payload = await parseJsonResponse<AdminUser & ApiErrorPayload>(response);
      if (!response.ok) {
        throw new Error(getErrorMessage(payload, "No fue posible actualizar el usuario."));
      }
      if (!payload) {
        throw new Error("La API no devolvió el usuario actualizado.");
      }
      setAdminUsers((current) => current.map((item) => (item.id === payload.id ? payload : item)));
      setAdminMessage(
        field === "active"
          ? `Estado actualizado para ${payload.name}.`
          : `Doble autenticación actualizada para ${payload.name}.`,
      );
    } catch (toggleError) {
      setAdminError(toggleError instanceof Error ? toggleError.message : "Error al actualizar usuario.");
    }
  };

  const handleDeleteAdminUser = async (user: AdminUser) => {
    const confirmed = window.confirm(`¿Deseas eliminar el registro de ${user.name}?`);
    if (!confirmed) {
      return;
    }

    setAdminError(null);
    setAdminMessage(null);
    try {
      const response = await fetch(`${API_BASE}/api/admin/users/${user.id}`, {
        method: "DELETE",
      });
      const payload = await parseJsonResponse<{ success?: boolean } & ApiErrorPayload>(response);
      if (!response.ok) {
        throw new Error(getErrorMessage(payload, "No fue posible eliminar el usuario."));
      }
      setAdminUsers((current) => current.filter((item) => item.id !== user.id));
      if (editingAdminUserId === user.id) {
        setEditingAdminUserId(null);
        setAdminForm(createAdminUserDraft());
      }
      setAdminMessage(`Usuario ${user.name} eliminado correctamente.`);
    } catch (deleteError) {
      setAdminError(deleteError instanceof Error ? deleteError.message : "Error al eliminar usuario.");
    }
  };

  const handleDraftFieldChange = (field: keyof AdminAppSettingsDraft, value: string | boolean) => {
    setAppSettingsDraft((current) => (current ? { ...current, [field]: value } : current));
  };

  const handleEndpointChange = (endpointId: string, field: keyof CorporateEndpoint, value: string | boolean) => {
    setAppSettingsDraft((current) =>
      current
        ? {
            ...current,
            corporate_endpoints: current.corporate_endpoints.map((endpoint) =>
              endpoint.id === endpointId ? { ...endpoint, [field]: value } : endpoint,
            ),
          }
        : current,
    );
  };

  const handleAddEndpoint = () => {
    setAppSettingsDraft((current) =>
      current
        ? {
            ...current,
            corporate_endpoints: [...current.corporate_endpoints, createEndpointDraft()],
          }
        : current,
    );
  };

  const handleRemoveEndpoint = (endpointId: string) => {
    setAppSettingsDraft((current) => {
      if (!current) {
        return current;
      }
      const nextEndpoints = current.corporate_endpoints.filter((endpoint) => endpoint.id !== endpointId);
      return {
        ...current,
        corporate_endpoints: nextEndpoints.length > 0 ? nextEndpoints : [createEndpointDraft()],
      };
    });
  };

  const handleSaveAppSettings = async (event: FormEvent) => {
    event.preventDefault();
    if (!appSettingsDraft) {
      return;
    }

    setAppSettingsSaving(true);
    setAppSettingsError(null);
    setAppSettingsMessage(null);

    try {
      const payload = {
        ...appSettingsDraft,
        allowed_domains: appSettingsDraft.allowed_domains_text
          .split(",")
          .map((domain) => domain.trim().replace(/^@/, ""))
          .filter(Boolean),
        admin_user_emails: appSettingsDraft.admin_user_emails_text
          .split(",")
          .map((email) => email.trim().toLowerCase())
          .filter(Boolean),
        allowed_origins: appSettingsDraft.allowed_origins_text
          .split(",")
          .map((origin) => origin.trim())
          .filter(Boolean),
        corporate_endpoints: appSettingsDraft.corporate_endpoints
          .map((endpoint) => ({
            ...endpoint,
            name: endpoint.name.trim(),
            base_url: endpoint.base_url?.trim() || null,
            auth_method: endpoint.auth_method?.trim() || null,
            owner: endpoint.owner?.trim() || null,
            pii_scope: endpoint.pii_scope?.trim() || null,
          }))
          .filter((endpoint) => endpoint.name.length > 0),
      };

      const response = await fetch(`${API_BASE}/api/admin/app-settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const parsed = await parseJsonResponse<AdminAppSettings & ApiErrorPayload>(response);
      if (!response.ok) {
        throw new Error(getErrorMessage(parsed, "No fue posible guardar la configuración del App."));
      }
      if (!parsed) {
        throw new Error("La API no devolvió la configuración actualizada.");
      }
      setAppSettings(parsed);
      setAppSettingsDraft(toSettingsDraft(parsed));
      await loadInitialData();
      setAppSettingsMessage("Configuración corporativa actualizada correctamente.");
    } catch (settingsSaveError) {
      setAppSettingsError(
        settingsSaveError instanceof Error ? settingsSaveError.message : "Error al guardar la configuración.",
      );
    } finally {
      setAppSettingsSaving(false);
    }
  };

  const handleLogout = () => {
    setSession(null);
    setPendingLogin(null);
    setTwoFactorCode("");
    setLoginMessage(null);
    setActiveSection("inicio");
  };

  if (!session) {
    return (
      <div className="login-page">
        <header className="login-topbar">
          <div className="login-topbar-center">
            <img alt="Tema Litoclean" className="login-topbar-logo" src={LOGO_TEMA_IMAGE} />
            <div className="login-topbar-copy">
              <strong>Tema Litoclean</strong>
              <p>Plataforma interna de productividad y operaciones medioambientales</p>
            </div>
          </div>
        </header>

        <main className="login-hero">
          <section className="login-visual-panel" style={{ backgroundImage: `url(${PORTADA_IMAGE})` }}>
            <div className="login-visual-overlay" />
            <div className="login-hero-content">
              <div className="login-logo-card">
                <span>GM</span>
              </div>
              <div className="login-copy">
                <p className="eyebrow light">Tema Litoclean</p>
                <h1>Gestión medioambiental asistida por IA</h1>
                <p>
                  Orquesta PDFs, formularios, reportes, datos corporativos y automatización ofimática
                  desde una única superficie de trabajo segura.
                </p>
                <div className="login-copy-meta">
                  <span>Solo personal corporativo</span>
                  <span>Doble autenticación obligatoria</span>
                  <span>Dominios permitidos: {corporateDomainHint}</span>
                </div>
              </div>
            </div>

            <aside className="login-card login-card-floating">
              {!pendingLogin ? (
                <>
                  <div className="login-card-header">
                    <h2>Iniciar sesión</h2>
                  </div>

                  <form className="login-form" onSubmit={handleCorporateLogin}>
                    <label>
                      <span>Correo corporativo</span>
                      <input
                        type="email"
                        value={loginEmail}
                        onChange={(event) => setLoginEmail(event.target.value)}
                        placeholder={`usuario${corporateDomainHint ? corporateDomainHint.split(", ")[0] : "@empresa.com"}`}
                        autoComplete="email"
                      />
                    </label>

                    <label>
                      <span>Contraseña</span>
                      <div className="login-password-field">
                        <input
                          type={showLoginPassword ? "text" : "password"}
                          value={loginPassword}
                          onChange={(event) => setLoginPassword(event.target.value)}
                          placeholder="Ingresa tu contraseña"
                          autoComplete="current-password"
                        />
                        <button
                          className="login-password-toggle"
                          onClick={() => setShowLoginPassword((current) => !current)}
                          type="button"
                        >
                          {showLoginPassword ? "Ocultar" : "Ver"}
                        </button>
                      </div>
                    </label>

                    <button className="login-button" disabled={loginLoading} type="submit">
                      {loginLoading ? "Validando..." : "Conectar"}
                    </button>
                  </form>

                  <div className="login-card-links">
                    <button className="login-text-link" type="button">
                      ¿Has olvidado tu contraseña?
                    </button>
                    <button className="login-text-link" onClick={() => void handleActivationCodeRequest()} type="button">
                      Código de activación
                    </button>
                  </div>

                  <div className="login-footnote">
                    <p>Acceso: {policy?.identity_provider ?? "Acceso corporativo"}</p>
                    <p>Dominios: {corporateDomainHint || "pendientes de parametrizar"}</p>
                  </div>

                  {loginMessage && <div className="warning-box">{loginMessage}</div>}
                  {loginError && <div className="error-box">{loginError}</div>}
                </>
              ) : (
                <>
                  <div className="login-card-header">
                    <h2>Doble autenticación</h2>
                    <p>
                      Hemos enviado un código de verificación al correo {pendingLogin.masked_destination}.
                      Para esta demo, el código es <strong>246810</strong>.
                    </p>
                  </div>
                  <form className="login-form" onSubmit={handleTwoFactor}>
                    <label>
                      <span>Código de verificación</span>
                      <input
                        type="text"
                        value={twoFactorCode}
                        onChange={(event) => setTwoFactorCode(event.target.value)}
                        placeholder="Ingresa el código"
                      />
                    </label>
                    <button className="login-button" disabled={twoFactorLoading} type="submit">
                      {twoFactorLoading ? "Verificando..." : "Validar código"}
                    </button>
                  </form>
                  <button className="login-text-link" onClick={() => void handleActivationCodeRequest()} type="button">
                    Reenviar código
                  </button>
                  <button className="secondary-button" onClick={() => setPendingLogin(null)} type="button">
                    Volver al inicio de sesión
                  </button>
                  {twoFactorError && <div className="error-box">{twoFactorError}</div>}
                </>
              )}
            </aside>
          </section>
        </main>

        <footer className="login-footer">
          <div className="login-footer-copy">
            Tema Litoclean es una plataforma interna para personal corporativo autorizado.
          </div>
          <img alt="Tema Litoclean" className="login-footer-logo" src={LOGO_TEMA_IMAGE} />
        </footer>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-card brand-card-strong">
          <img alt="Tema Litoclean" className="sidebar-logo" src={LOGO_TEMA_IMAGE} />
          <p className="eyebrow eyebrow-light">Tema Litoclean</p>
          <h1>Centro corporativo</h1>
          <p>Aplicación interna modular para operaciones, productividad y gobierno del dato.</p>
          <div className="session-chip">
            <strong>{session.user_name ?? session.email}</strong>
            <span>{session.email}</span>
            <span>{session.is_admin ? "Administrador corporativo" : "Usuario corporativo"}</span>
          </div>
        </div>

        <nav className="nav-card">
          <p className="nav-title">Secciones</p>
          {visibleSections.map((section) => (
            <button
              className={activeSection === section.id ? "nav-button active" : "nav-button"}
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              type="button"
            >
              <strong>{section.label}</strong>
              <span>{section.description}</span>
            </button>
          ))}
        </nav>

        <div className="status-card status-card-accent">
          <div className="status-header">
            <h2>Configuración</h2>
            <span className={pendingConfig === 0 ? "badge ok" : "badge"}>
              {pendingConfig === 0 ? "lista" : `${pendingConfig} pendientes`}
            </span>
          </div>
          <div className="metrics-grid">
            <div className="metric-card">
              <strong>{configCompletion}%</strong>
              <span>avance</span>
            </div>
            <div className="metric-card">
              <strong>{capabilities.length}</strong>
              <span>módulos</span>
            </div>
            <div className="metric-card">
              <strong>{enabledEndpoints}</strong>
              <span>endpoints</span>
            </div>
          </div>
          <div className="access-summary">
            <strong>Acceso corporativo</strong>
            <p>{policy?.login_message ?? "Solo usuarios corporativos con doble autenticación."}</p>
          </div>
          {config?.items.slice(0, 6).map((item) => (
            <div className="config-item" key={item.key}>
              <div>
                <strong>{item.label}</strong>
                <p>{item.value || "Pendiente de parametrizar"}</p>
              </div>
              <span className={item.configured ? "dot ok" : "dot"} />
            </div>
          ))}
        </div>
      </aside>

      <main className="main-content">
        <header className="workspace-topbar">
          <div>
            <p className="eyebrow">Plataforma interna</p>
            <h2>{currentSection.label}</h2>
            <p className="topbar-description">{currentSection.description}</p>
          </div>
          <div className="topbar-actions">
            <div className="topbar-chip">
              <strong>{config?.preferred_surface ?? "Web"}</strong>
              <span>{config?.deployment_target ?? "Cloud"}</span>
            </div>
            <button className="secondary-button compact-button" onClick={handleLogout} type="button">
              Cerrar sesión
            </button>
          </div>
        </header>

        {activeSection === "inicio" && (
          <>
            <section className="hero-card hero-card-gradient">
              <div>
                <p className="eyebrow">Superficie {config?.preferred_surface ?? "Web"}</p>
                <h3>Aplicación corporativa organizada por dominios funcionales</h3>
                <p>
                  La plataforma separa claramente operación, módulos, archivos y administración para
                  facilitar adopción, gobierno y escalabilidad.
                </p>
                <p className="hero-note">
                  Configuración lista: {configuredConfig}/{config?.items.length ?? 0} bloques. Acceso:
                  {policy?.require_two_factor ? " 2FA activo" : " 2FA opcional"}.
                </p>
              </div>
              <div className="prompt-grid">
                {starterPrompts.map((prompt) => (
                  <button key={prompt} className="prompt-chip" onClick={() => setMessage(prompt)} type="button">
                    {prompt}
                  </button>
                ))}
              </div>
            </section>

            <section className="section-grid">
              <article className="panel module-overview-card">
                <div className="panel-header">
                  <h3>Operación guiada</h3>
                  <span className="badge ok">usuarios</span>
                </div>
                <p>Ejecuta instrucciones al agente, sube archivos y revisa resultados con trazabilidad.</p>
                <button className="primary-button" onClick={() => setActiveSection("operacion")} type="button">
                  Ir a operación
                </button>
              </article>

              <article className="panel module-overview-card">
                <div className="panel-header">
                  <h3>Catálogo modular</h3>
                  <span className="badge">{capabilities.length} activos</span>
                </div>
                <p>Las funcionalidades están separadas por módulos para crecer sin mezclar experiencias.</p>
                <button className="primary-button" onClick={() => setActiveSection("modulos")} type="button">
                  Ver módulos
                </button>
              </article>

              <article className="panel module-overview-card">
                <div className="panel-header">
                  <h3>Gestión documental</h3>
                  <span className="badge">{uploadedFiles.length} cargados</span>
                </div>
                <p>Centraliza archivos de entrada y artefactos generados por el agente en una sola sección.</p>
                <button className="primary-button" onClick={() => setActiveSection("archivos")} type="button">
                  Revisar archivos
                </button>
              </article>
            </section>

            <section className="panel">
              <div className="panel-header">
                <h3>Mapa funcional</h3>
                <span className="badge">{capabilityHighlights.length} dominios</span>
              </div>
              <div className="feature-grid">
                {capabilityHighlights.map((capability) => (
                  <article className="feature-card" key={capability.tool}>
                    <p className="eyebrow">{capability.quickLabel}</p>
                    <h4>{capability.title}</h4>
                    <p>{capability.description}</p>
                  </article>
                ))}
              </div>
            </section>
          </>
        )}

        {activeSection === "operacion" && (
          <>
            <section className="panel">
              <div className="panel-header">
                <h3>Lectura inteligente de PDF</h3>
                <span className="badge ok">Laravel + IA</span>
              </div>
              <div className="workspace-grid">
                <div className="steps-block">
                  <p className="muted">
                    El flujo primero extrae el texto del PDF con Laravel a un Markdown estructurado y luego aplica la
                    instrucción que indiques para que el modelo responda sobre ese contenido.
                  </p>
                  <ol className="process-list">
                    <li>Se extrae el texto página por página desde Laravel.</li>
                    <li>Se convierte a Markdown fácil de consumir por un modelo.</li>
                    <li>Se ejecuta tu prompt de negocio, auditoría, legal o análisis técnico.</li>
                    <li>Si la IA corporativa no está disponible, igual se entregan el Markdown y el prompt listos.</li>
                  </ol>
                </div>

                <div className="chat-form">
                  <label>
                    <span>Solicitud para la IA sobre el PDF</span>
                    <textarea
                      value={pdfReadingPrompt}
                      onChange={(event) => setPdfReadingPrompt(event.target.value)}
                      rows={6}
                      placeholder="Ejemplo: resume obligaciones, riesgos, responsables, fechas y siguientes acciones del documento."
                    />
                  </label>
                  <div className="interaction-toolbar">
                    <button className="primary-button compact-button" onClick={handlePreparePdfReading} type="button">
                      Preparar flujo PDF + IA
                    </button>
                    {speechSupported && !isListening && (
                      <button className="secondary-button compact-button" onClick={handleStartVoicePrompt} type="button">
                        Hablar prompt
                      </button>
                    )}
                    {speechSupported && isListening && (
                      <button className="ghost-button compact-button" onClick={handleStopVoicePrompt} type="button">
                        Detener dictado
                      </button>
                    )}
                  </div>
                  <p className="voice-status">
                    {speechSupported
                      ? isListening
                        ? "Escuchando tu instrucción por voz..."
                        : "Puedes escribir tu prompt o dictarlo con voz."
                      : "El dictado por voz depende del soporte del navegador."}
                  </p>
                  {speechError && <div className="warning-box">{speechError}</div>}
                </div>
              </div>
            </section>

            <section className="panel">
              <div className="panel-header">
                <h3>Playbooks PDF empresariales</h3>
                <span className="badge">{pdfWorkflowCards.length} flujos</span>
              </div>
              <p className="muted">
                Flujos listos para expedientes, anexos, auditorías, propuestas, contratos y documentos operativos.
              </p>
              <div className="section-grid">
                {pdfWorkflowCards.map((workflow) => (
                  <article className="feature-card" key={workflow.title}>
                    <p className="eyebrow">{workflow.badge}</p>
                    <h4>{workflow.title}</h4>
                    <p>{workflow.description}</p>
                    <button
                      className="secondary-button compact-button"
                      onClick={() => handlePromptShortcut(workflow.prompt)}
                      type="button"
                    >
                      Ejecutar flujo
                    </button>
                  </article>
                ))}
              </div>
            </section>

            <section className="panel">
              <div className="panel-header">
                <h3>Programas premium para consultoría ambiental</h3>
                <span className="badge ok">{premiumWorkflowCards.length} recetas</span>
              </div>
              <p className="muted">
                Operaciones deterministas en PHP puro. Sube tus Excel/CSV en la sección de entrada y luego ejecuta una
                receta. La IA solo se usa para la narrativa de los informes cuando está habilitada.
              </p>
              <div className="section-grid">
                {premiumWorkflowCards.map((workflow) => (
                  <article className="feature-card" key={workflow.title}>
                    <p className="eyebrow">{workflow.badge}</p>
                    <h4>{workflow.title}</h4>
                    <p>{workflow.description}</p>
                    {workflow.acceptsFiles && <p className="muted">Admite carga de archivos (.xlsx, .csv).</p>}
                    <button
                      className="primary-button compact-button"
                      onClick={() => handlePromptShortcut(workflow.prompt)}
                      type="button"
                    >
                      Ejecutar
                    </button>
                  </article>
                ))}
              </div>
            </section>

            <section className="workspace-grid">
              <div className="panel">
                <div className="panel-header">
                  <h3>Entrada del agente</h3>
                  <label className="upload-button">
                    {uploading ? "Subiendo..." : "Subir archivos"}
                    <input
                      accept=".pdf,.docx,.xlsx,.pptx,.doc,.xls,.ppt,.txt,.csv,.png,.jpg,.jpeg,.webp"
                      multiple
                      onChange={handleUpload}
                      type="file"
                    />
                  </label>
                </div>
                <p className="muted">
                  Admite hasta {MAX_UPLOAD_FILE_SIZE_MB} MB por archivo y {MAX_UPLOAD_FILES_PER_REQUEST} archivos por solicitud.
                </p>

                <div className="uploaded-list">
                  {uploadedFiles.length === 0 && <p className="muted">No hay archivos cargados.</p>}
                  {uploadedFiles.map((file) => (
                    <span className="file-pill" key={file.id}>
                      {file.name} · {formatFileSize(file.size)}
                    </span>
                  ))}
                </div>

                <form className="chat-form" onSubmit={handleSubmit}>
                  <textarea
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    rows={7}
                    maxLength={4000}
                    placeholder="Escribe una instrucción para el agente..."
                  />
                  <span className="muted char-counter">{message.length}/4000</span>
                  <button className="primary-button" disabled={loading} type="submit">
                    {loading ? "Procesando..." : "Ejecutar"}
                  </button>
                </form>

                {error && <div className="error-box">{error}</div>}
              </div>

              <div className="panel">
                <div className="panel-header">
                  <h3>Resultado</h3>
                  {result && <span className="badge ok">{result.tool_name}</span>}
                </div>

                {!result && <p className="muted">El resultado del trabajo aparecerá aquí.</p>}
                {result && (
                  <>
                    <div className="result-card">
                      <p>
                        <strong>Job:</strong> {result.job_id}
                      </p>
                      <p>{result.reply}</p>
                      {result.requires_confirmation && (
                        <p className="warning-box">Esta acción requiere confirmación humana antes de escribir datos.</p>
                      )}
                    </div>

                    <div className="steps-block">
                      <h4>Pasos</h4>
                      <ol>
                        {result.steps.map((step) => (
                          <li key={step}>{step}</li>
                        ))}
                      </ol>
                    </div>

                    <div className="steps-block">
                      <h4>Artefactos</h4>
                      {result.artifacts.length === 0 && <p className="muted">No se generaron archivos.</p>}
                      {result.artifacts.map((artifact) => (
                        <a
                          className="artifact-link"
                          href={buildDownloadUrl(artifact.download_url)}
                          key={artifact.id}
                          rel="noreferrer"
                          target="_blank"
                        >
                          {artifact.name}
                        </a>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </section>

            <section className="panel">
              <div className="panel-header">
                <h3>Comunicación natural especializada</h3>
                <span className="badge ok">asistida</span>
              </div>
              <p className="muted">
                El agente puede interpretar solicitudes técnicas, documentales y evolutivas usando lenguaje natural.
              </p>
              <div className="prompt-grid">
                {specializedConversationPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    className="prompt-chip"
                    onClick={() => handlePromptShortcut(prompt)}
                    type="button"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </section>
          </>
        )}

        {activeSection === "modulos" && (
          <>
            <section className="panel">
              <div className="panel-header">
                <h3>Especialidades funcionales</h3>
                <span className="badge ok">lenguaje natural</span>
              </div>
              <div className="section-grid">
                {moduleSpotlights.map((spotlight) => (
                  <article className="feature-card" key={spotlight.title}>
                    <p className="eyebrow">{spotlight.badge}</p>
                    <h4>{spotlight.title}</h4>
                    <p>{spotlight.description}</p>
                    <button
                      className="secondary-button compact-button"
                      onClick={() => handlePromptShortcut(spotlight.prompt)}
                      type="button"
                    >
                      Ejecutar especialidad
                    </button>
                  </article>
                ))}
              </div>
            </section>

            <section className="panel capabilities-panel">
              <div className="panel-header">
                <h3>Capacidades</h3>
                <span className="badge">{capabilities.length} módulos</span>
              </div>
              <div className="capability-grid">
                {capabilities.map((capability) => (
                  <article className="capability-card capability-card-accent" key={capability.tool}>
                    <p className="eyebrow">{capability.tool}</p>
                    <h4>{capability.title}</h4>
                    <p>{capability.description}</p>
                    <ul>
                      {capability.examples.map((example) => (
                        <li key={example}>{example}</li>
                      ))}
                    </ul>
                    <button
                      className="secondary-button compact-button"
                      onClick={() =>
                        handlePromptShortcut(
                          capability.examples[0] ?? `Quiero usar el módulo ${capability.title.toLowerCase()}`,
                        )
                      }
                      type="button"
                    >
                      Ejecutar módulo
                    </button>
                  </article>
                ))}
              </div>
            </section>

            <section className="panel">
              <div className="panel-header">
                <h3>Prompts especializados</h3>
                <span className="badge">{specializedConversationPrompts.length}</span>
              </div>
              <div className="prompt-grid">
                {specializedConversationPrompts.map((prompt) => (
                  <button
                    key={`${prompt}-modulo`}
                    className="prompt-chip"
                    onClick={() => handlePromptShortcut(prompt)}
                    type="button"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </section>
          </>
        )}

        {activeSection === "archivos" && (
          <>
            <section className="section-grid files-grid">
              <div className="panel">
                <div className="panel-header">
                  <h3>Archivos cargados</h3>
                  <span className="badge">{uploadedFiles.length}</span>
                </div>
                <div className="file-list">
                  {uploadedFiles.length === 0 && <p className="muted">Todavía no se han cargado archivos.</p>}
                  {uploadedFiles.map((file) => (
                    <div className="file-row" key={file.id}>
                      <strong>{file.name}</strong>
                      <span>{file.kind}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="panel">
                <div className="panel-header">
                  <h3>Artefactos generados</h3>
                  <span className="badge ok">{recentArtifacts.length}</span>
                </div>
                <div className="file-list">
                  {recentArtifacts.length === 0 && (
                    <p className="muted">Los artefactos aparecerán aquí después de ejecutar un flujo.</p>
                  )}
                  {recentArtifacts.map((artifact) => (
                    <a
                      className="file-row file-row-link"
                      href={buildDownloadUrl(artifact.download_url)}
                      key={artifact.id}
                      rel="noreferrer"
                      target="_blank"
                    >
                      <strong>{artifact.name}</strong>
                      <span>{artifact.kind}</span>
                    </a>
                  ))}
                </div>
              </div>
            </section>

            <section className="panel">
              <div className="panel-header">
                <h3>Acciones sugeridas sobre tus archivos</h3>
                <span className="badge">{uploadedPdfCount} PDF</span>
              </div>
              <p className="muted">
                {uploadedPdfCount === 0
                  ? "Sube PDFs en Operación para habilitar partición por páginas, secciones, extracción de rangos y limpieza de folios."
                  : "Tus PDFs ya pueden enviarse a operación con flujos especializados para auditoría, archivo y gestión documental."}
              </p>
              <div className="section-grid">
                {pdfWorkflowCards.map((workflow) => (
                  <article className="feature-card" key={`${workflow.title}-archivo`}>
                    <p className="eyebrow">{workflow.badge}</p>
                    <h4>{workflow.title}</h4>
                    <p>{workflow.description}</p>
                    <button
                      className="secondary-button compact-button"
                      onClick={() => handlePromptShortcut(workflow.prompt)}
                      type="button"
                    >
                      Ejecutar acción
                    </button>
                  </article>
                ))}
              </div>
            </section>
          </>
        )}

        {activeSection === "admin" && session.is_admin && (
          <section className="admin-layout admin-layout-themed">
            <div className="panel admin-panel admin-panel-settings">
              <div className="panel-header">
                <div>
                  <p className="eyebrow admin-eyebrow">Gobierno corporativo</p>
                  <h3>Configuración del App</h3>
                </div>
                <span className="badge ok">{enabledEndpoints} endpoints activos</span>
              </div>

              {appSettingsLoading && <p className="muted">Cargando configuración corporativa...</p>}

              {!appSettingsLoading && (
                <div className="admin-overview-grid">
                  <article className="admin-overview-card">
                    <strong>{config?.items.length ?? 0}</strong>
                    <span>bloques de configuración</span>
                  </article>
                  <article className="admin-overview-card">
                    <strong>{editableConfigBlocks.length}</strong>
                    <span>áreas editables</span>
                  </article>
                  <article className="admin-overview-card">
                    <strong>{policy?.allowed_domains.length ?? 0}</strong>
                    <span>dominios corporativos</span>
                  </article>
                  <article className="admin-overview-card">
                    <strong>{enabledEndpoints}</strong>
                    <span>endpoints activos</span>
                  </article>
                </div>
              )}

              {appSettingsError && <div className="error-box">{appSettingsError}</div>}

              {!appSettingsLoading && !appSettingsDraft && (
                <div className="admin-empty-state">
                  <h4>No se pudo mostrar la configuración avanzada</h4>
                  <p>
                    El backend sí tiene soporte para la configuración del App, pero esta pantalla no pudo
                    cargarlo en este momento. Puedes reintentar la lectura sin salir de la sesión.
                  </p>
                  <div className="admin-inline-actions">
                    <button className="primary-button" onClick={() => void loadAdminAppSettings()} type="button">
                      Reintentar carga
                    </button>
                  </div>
                  <div className="admin-summary-list">
                    {editableConfigBlocks.map((block) => (
                      <span className="file-pill" key={block}>
                        {block}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {!appSettingsLoading && appSettingsDraft && (
                <form className="settings-form" onSubmit={handleSaveAppSettings}>
                  <div className="settings-grid">
                    <section className="settings-section">
                      <h4>Identidad y despliegue</h4>
                      <label>
                        <span>Nombre del App</span>
                        <input
                          type="text"
                          value={appSettingsDraft.app_name}
                          onChange={(event) => handleDraftFieldChange("app_name", event.target.value)}
                        />
                      </label>
                      <label>
                        <span>Empresa</span>
                        <input
                          type="text"
                          value={appSettingsDraft.company_name}
                          onChange={(event) => handleDraftFieldChange("company_name", event.target.value)}
                        />
                      </label>
                      <label>
                        <span>Industria</span>
                        <input
                          type="text"
                          value={appSettingsDraft.company_industry}
                          onChange={(event) => handleDraftFieldChange("company_industry", event.target.value)}
                        />
                      </label>
                      <label>
                        <span>Superficie preferida</span>
                        <input
                          type="text"
                          value={appSettingsDraft.preferred_surface}
                          onChange={(event) => handleDraftFieldChange("preferred_surface", event.target.value)}
                        />
                      </label>
                      <label>
                        <span>Despliegue</span>
                        <input
                          type="text"
                          value={appSettingsDraft.deployment_target}
                          onChange={(event) => handleDraftFieldChange("deployment_target", event.target.value)}
                        />
                      </label>
                    </section>

                    <section className="settings-section">
                      <h4>Acceso corporativo</h4>
                      <label>
                        <span>Proveedor de identidad</span>
                        <input
                          type="text"
                          value={appSettingsDraft.corporate_identity_provider}
                          onChange={(event) =>
                            handleDraftFieldChange("corporate_identity_provider", event.target.value)
                          }
                        />
                      </label>
                      <label>
                        <span>Dominios permitidos</span>
                        <input
                          type="text"
                          value={appSettingsDraft.allowed_domains_text}
                          onChange={(event) => handleDraftFieldChange("allowed_domains_text", event.target.value)}
                          placeholder="tema.com.pe, tema.es"
                        />
                      </label>
                      <label>
                        <span>Correos administradores</span>
                        <input
                          type="text"
                          value={appSettingsDraft.admin_user_emails_text}
                          onChange={(event) => handleDraftFieldChange("admin_user_emails_text", event.target.value)}
                          placeholder="admin@tema.com.pe, seguridad@tema.es"
                        />
                      </label>
                      <div className="toggle-grid">
                        <button
                          className={appSettingsDraft.require_corporate_email ? "toggle-chip active" : "toggle-chip"}
                          onClick={() =>
                            handleDraftFieldChange("require_corporate_email", !appSettingsDraft.require_corporate_email)
                          }
                          type="button"
                        >
                          Correo corporativo
                        </button>
                        <button
                          className={appSettingsDraft.require_two_factor ? "toggle-chip active" : "toggle-chip"}
                          onClick={() => handleDraftFieldChange("require_two_factor", !appSettingsDraft.require_two_factor)}
                          type="button"
                        >
                          Doble autenticación
                        </button>
                      </div>
                    </section>

                    <section className="settings-section">
                      <h4>Gobierno de datos</h4>
                      <label>
                        <span>Restricciones de datos</span>
                        <textarea
                          value={appSettingsDraft.data_restrictions ?? ""}
                          onChange={(event) => handleDraftFieldChange("data_restrictions", event.target.value)}
                          rows={3}
                        />
                      </label>
                      <label>
                        <span>Política PII</span>
                        <textarea
                          value={appSettingsDraft.pii_policy ?? ""}
                          onChange={(event) => handleDraftFieldChange("pii_policy", event.target.value)}
                          rows={3}
                        />
                      </label>
                      <label>
                        <span>Retención y auditoría</span>
                        <textarea
                          value={appSettingsDraft.retention_policy ?? ""}
                          onChange={(event) => handleDraftFieldChange("retention_policy", event.target.value)}
                          rows={3}
                        />
                      </label>
                      <label>
                        <span>Observabilidad</span>
                        <textarea
                          value={appSettingsDraft.observability_notes ?? ""}
                          onChange={(event) => handleDraftFieldChange("observability_notes", event.target.value)}
                          rows={3}
                        />
                      </label>
                    </section>

                    <section className="settings-section">
                      <h4>IA generativa y presupuesto</h4>
                      <label>
                        <span>Proveedor aprobado</span>
                        <input
                          type="text"
                          value={appSettingsDraft.approved_gen_ai_provider ?? ""}
                          onChange={(event) => handleDraftFieldChange("approved_gen_ai_provider", event.target.value)}
                        />
                      </label>
                      <label>
                        <span>Proveedor imagen</span>
                        <input
                          type="text"
                          value={appSettingsDraft.gen_image_api_provider ?? ""}
                          onChange={(event) => handleDraftFieldChange("gen_image_api_provider", event.target.value)}
                        />
                      </label>
                      <label>
                        <span>Proveedor video</span>
                        <input
                          type="text"
                          value={appSettingsDraft.gen_video_api_provider ?? ""}
                          onChange={(event) => handleDraftFieldChange("gen_video_api_provider", event.target.value)}
                        />
                      </label>
                      <label>
                        <span>Presupuesto mensual</span>
                        <input
                          type="text"
                          value={appSettingsDraft.gen_api_budget_monthly ?? ""}
                          onChange={(event) => handleDraftFieldChange("gen_api_budget_monthly", event.target.value)}
                        />
                      </label>
                      <label>
                        <span>Umbral de alerta</span>
                        <input
                          type="text"
                          value={appSettingsDraft.gen_api_budget_alert_threshold ?? ""}
                          onChange={(event) =>
                            handleDraftFieldChange("gen_api_budget_alert_threshold", event.target.value)
                          }
                        />
                      </label>
                      <label>
                        <span>API key Anthropic</span>
                        <input
                          type="password"
                          value={appSettingsDraft.anthropic_api_key ?? ""}
                          onChange={(event) => handleDraftFieldChange("anthropic_api_key", event.target.value)}
                        />
                      </label>
                      <div className="toggle-grid">
                        <button
                          className={appSettingsDraft.enable_anthropic_routing ? "toggle-chip active" : "toggle-chip"}
                          onClick={() =>
                            handleDraftFieldChange("enable_anthropic_routing", !appSettingsDraft.enable_anthropic_routing)
                          }
                          type="button"
                        >
                          Routing Anthropic
                        </button>
                      </div>
                    </section>

                    <section className="settings-section">
                      <h4>Microsoft 365 y Graph</h4>
                      <label>
                        <span>Tenant ID</span>
                        <input
                          type="text"
                          value={appSettingsDraft.office_graph_tenant_id ?? ""}
                          onChange={(event) => handleDraftFieldChange("office_graph_tenant_id", event.target.value)}
                        />
                      </label>
                      <label>
                        <span>Client ID</span>
                        <input
                          type="text"
                          value={appSettingsDraft.office_graph_client_id ?? ""}
                          onChange={(event) => handleDraftFieldChange("office_graph_client_id", event.target.value)}
                        />
                      </label>
                      <label>
                        <span>Client Secret</span>
                        <input
                          type="password"
                          value={appSettingsDraft.office_graph_client_secret ?? ""}
                          onChange={(event) => handleDraftFieldChange("office_graph_client_secret", event.target.value)}
                        />
                      </label>
                    </section>

                    <section className="settings-section">
                      <h4>Infraestructura y operación</h4>
                      <label>
                        <span>Allowed origins</span>
                        <input
                          type="text"
                          value={appSettingsDraft.allowed_origins_text}
                          onChange={(event) => handleDraftFieldChange("allowed_origins_text", event.target.value)}
                          placeholder="http://localhost:5173"
                        />
                      </label>
                      <label>
                        <span>Storage dir</span>
                        <input
                          type="text"
                          value={appSettingsDraft.storage_dir}
                          onChange={(event) => handleDraftFieldChange("storage_dir", event.target.value)}
                        />
                      </label>
                      <label>
                        <span>Audit dir</span>
                        <input
                          type="text"
                          value={appSettingsDraft.audit_dir}
                          onChange={(event) => handleDraftFieldChange("audit_dir", event.target.value)}
                        />
                      </label>
                      <div className="toggle-grid">
                        <button
                          className={appSettingsDraft.mock_corporate_data ? "toggle-chip active" : "toggle-chip"}
                          onClick={() =>
                            handleDraftFieldChange("mock_corporate_data", !appSettingsDraft.mock_corporate_data)
                          }
                          type="button"
                        >
                          Mock corporate data
                        </button>
                      </div>
                    </section>
                  </div>

                  <section className="settings-section settings-section-full">
                    <div className="panel-header">
                      <h4>Integraciones corporativas</h4>
                      <button className="secondary-button compact-button" onClick={handleAddEndpoint} type="button">
                        Agregar endpoint
                      </button>
                    </div>
                    <div className="settings-grid settings-grid-compact">
                      <label>
                        <span>Base URL principal</span>
                        <input
                          type="text"
                          value={appSettingsDraft.corporate_api_base_url ?? ""}
                          onChange={(event) => handleDraftFieldChange("corporate_api_base_url", event.target.value)}
                        />
                      </label>
                      <label>
                        <span>Método de autenticación</span>
                        <input
                          type="text"
                          value={appSettingsDraft.corporate_api_auth_method ?? ""}
                          onChange={(event) => handleDraftFieldChange("corporate_api_auth_method", event.target.value)}
                        />
                      </label>
                      <label>
                        <span>Endpoints clave</span>
                        <textarea
                          value={appSettingsDraft.corporate_api_key_endpoints ?? ""}
                          onChange={(event) => handleDraftFieldChange("corporate_api_key_endpoints", event.target.value)}
                          rows={3}
                        />
                      </label>
                      <label>
                        <span>Casos prioritarios</span>
                        <textarea
                          value={appSettingsDraft.phase1_priority_use_cases}
                          onChange={(event) => handleDraftFieldChange("phase1_priority_use_cases", event.target.value)}
                          rows={3}
                        />
                      </label>
                    </div>

                    <div className="endpoint-list">
                      {appSettingsDraft.corporate_endpoints.map((endpoint) => (
                        <article className="endpoint-card" key={endpoint.id}>
                          <div className="endpoint-card-header">
                            <h5>{endpoint.name || "Nuevo endpoint corporativo"}</h5>
                            <div className="endpoint-actions">
                              <button
                                className={endpoint.enabled ? "toggle-chip active" : "toggle-chip"}
                                onClick={() => handleEndpointChange(endpoint.id, "enabled", !endpoint.enabled)}
                                type="button"
                              >
                                {endpoint.enabled ? "Activo" : "Inactivo"}
                              </button>
                              <button
                                className="ghost-button"
                                onClick={() => handleRemoveEndpoint(endpoint.id)}
                                type="button"
                              >
                                Eliminar
                              </button>
                            </div>
                          </div>
                          <div className="endpoint-grid">
                            <label>
                              <span>Nombre</span>
                              <input
                                type="text"
                                value={endpoint.name}
                                onChange={(event) => handleEndpointChange(endpoint.id, "name", event.target.value)}
                              />
                            </label>
                            <label>
                              <span>Base URL</span>
                              <input
                                type="text"
                                value={endpoint.base_url ?? ""}
                                onChange={(event) =>
                                  handleEndpointChange(endpoint.id, "base_url", event.target.value)
                                }
                              />
                            </label>
                            <label>
                              <span>Autenticación</span>
                              <input
                                type="text"
                                value={endpoint.auth_method ?? ""}
                                onChange={(event) =>
                                  handleEndpointChange(endpoint.id, "auth_method", event.target.value)
                                }
                              />
                            </label>
                            <label>
                              <span>Responsable</span>
                              <input
                                type="text"
                                value={endpoint.owner ?? ""}
                                onChange={(event) => handleEndpointChange(endpoint.id, "owner", event.target.value)}
                              />
                            </label>
                            <label>
                              <span>PII / alcance</span>
                              <input
                                type="text"
                                value={endpoint.pii_scope ?? ""}
                                onChange={(event) =>
                                  handleEndpointChange(endpoint.id, "pii_scope", event.target.value)
                                }
                              />
                            </label>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                  {appSettingsMessage && <div className="success-box">{appSettingsMessage}</div>}

                  <div className="settings-actions">
                    <button className="primary-button" disabled={appSettingsSaving} type="submit">
                      {appSettingsSaving ? "Guardando..." : "Guardar configuración"}
                    </button>
                  </div>
                </form>
              )}
            </div>

            <div className="panel admin-panel admin-panel-users">
              <div className="panel-header">
                <div>
                  <p className="eyebrow admin-eyebrow">Control de acceso</p>
                  <h3>Administración profesional de usuarios</h3>
                </div>
                <span className="badge ok">{filteredAdminUsers.length} visibles</span>
              </div>

              <div className="admin-overview-grid admin-overview-grid-users">
                <article className="admin-overview-card">
                  <strong>{adminUsers.length}</strong>
                  <span>usuarios registrados</span>
                </article>
                <article className="admin-overview-card">
                  <strong>{activeAdminUsers}</strong>
                  <span>usuarios activos</span>
                </article>
                <article className="admin-overview-card">
                  <strong>{adminUsersWithTwoFactor}</strong>
                  <span>con doble autenticación</span>
                </article>
                <article className="admin-overview-card">
                  <strong>{adminAdministrators}</strong>
                  <span>administradores</span>
                </article>
              </div>

              <form className="admin-form admin-form-professional" onSubmit={handleSaveAdminUser}>
                <div className="admin-form-grid">
                  <label>
                    <span>Nombre completo</span>
                    <input
                      type="text"
                      placeholder="Nombre completo"
                      value={adminForm.name}
                      onChange={(event) => handleAdminFormChange("name", event.target.value)}
                    />
                  </label>
                  <label>
                    <span>Correo corporativo</span>
                    <input
                      type="email"
                      placeholder="usuario@tema.com.pe"
                      value={adminForm.email}
                      onChange={(event) => handleAdminFormChange("email", event.target.value)}
                    />
                  </label>
                  <label>
                    <span>Rol</span>
                    <select value={adminForm.role} onChange={(event) => handleAdminFormChange("role", event.target.value)}>
                      {adminRoleOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="toggle-grid">
                  <button
                    className={adminForm.active ? "toggle-chip active" : "toggle-chip"}
                    onClick={() => handleAdminFormChange("active", !adminForm.active)}
                    type="button"
                  >
                    {adminForm.active ? "Usuario activo" : "Usuario inactivo"}
                  </button>
                  <button
                    className={adminForm.two_factor_enabled ? "toggle-chip active" : "toggle-chip"}
                    onClick={() => handleAdminFormChange("two_factor_enabled", !adminForm.two_factor_enabled)}
                    type="button"
                  >
                    {adminForm.two_factor_enabled ? "2FA habilitado" : "2FA deshabilitado"}
                  </button>
                </div>

                <div className="admin-form-actions">
                  <button className="primary-button" type="submit">
                    {editingAdminUserId ? "Guardar usuario" : "Registrar usuario"}
                  </button>
                  {editingAdminUserId && (
                    <button className="secondary-button compact-button" onClick={handleCancelAdminEdit} type="button">
                      Cancelar edición
                    </button>
                  )}
                </div>
              </form>

              <div className="admin-toolbar">
                <label>
                  <span>Buscar usuario</span>
                  <input
                    type="text"
                    placeholder="Nombre, correo o rol"
                    value={adminUserSearch}
                    onChange={(event) => setAdminUserSearch(event.target.value)}
                  />
                </label>
                <label>
                  <span>Filtrar por rol</span>
                  <select value={adminRoleFilter} onChange={(event) => setAdminRoleFilter(event.target.value)}>
                    <option value="todos">Todos los roles</option>
                    {adminRoleOptions.map((option) => (
                      <option key={`filter-${option.value}`} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Filtrar por estado</span>
                  <select value={adminStatusFilter} onChange={(event) => setAdminStatusFilter(event.target.value)}>
                    <option value="todos">Todos</option>
                    <option value="activos">Activos</option>
                    <option value="inactivos">Inactivos</option>
                    <option value="2fa">2FA habilitado</option>
                  </select>
                </label>
              </div>

              {adminMessage && <div className="success-box">{adminMessage}</div>}
              {adminError && <div className="error-box">{adminError}</div>}

              <div className="admin-table">
                <div className="admin-table-header">
                  <span>Usuario</span>
                  <span>Rol</span>
                  <span>Estado</span>
                  <span>Acciones</span>
                </div>
                {adminLoading && <p className="muted">Cargando usuarios...</p>}
                {!adminLoading && filteredAdminUsers.length === 0 && (
                  <div className="admin-empty-state">
                    <h4>No hay coincidencias</h4>
                    <p>Ajusta la búsqueda o los filtros para localizar usuarios registrados.</p>
                  </div>
                )}
                {!adminLoading &&
                  filteredAdminUsers.map((user) => (
                    <div className="admin-row" key={user.id}>
                      <div>
                        <span className="admin-cell-label">Usuario</span>
                        <strong>{user.name}</strong>
                        <p>{user.email}</p>
                        <p>Alta: {formatDateTime(user.created_at)} | Actualización: {formatDateTime(user.updated_at)}</p>
                      </div>
                      <div className="admin-row-meta">
                        <span className="admin-cell-label">Rol</span>
                        <span>{getAdminRoleLabel(user.role)}</span>
                      </div>
                      <div className="admin-row-meta">
                        <span className="admin-cell-label">Estado</span>
                        <span>{user.active ? "Activo" : "Inactivo"}</span>
                        <span>{user.two_factor_enabled ? "2FA habilitado" : "2FA deshabilitado"}</span>
                      </div>
                      <div className="admin-row-meta admin-row-actions">
                        <span className="admin-cell-label">Acciones</span>
                        <button className="table-action" onClick={() => handleEditAdminUser(user)} type="button">
                          Editar
                        </button>
                        <button className="table-action" onClick={() => handleAdminToggle(user, "active")} type="button">
                          {user.active ? "Desactivar" : "Activar"}
                        </button>
                        <button
                          className="table-action"
                          onClick={() => handleAdminToggle(user, "two_factor_enabled")}
                          type="button"
                        >
                          {user.two_factor_enabled ? "Deshabilitar 2FA" : "Habilitar 2FA"}
                        </button>
                        <button className="ghost-button compact-button" onClick={() => handleDeleteAdminUser(user)} type="button">
                          Eliminar
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
