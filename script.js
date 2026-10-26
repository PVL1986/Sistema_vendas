// --- ESTADO GLOBAL DA APLICAÇÃO ---
let currentUser = null;
let userProfile = null;
let suppliers = [];
let clients = [];
let products = [];
let orders = [];
let installments = [];
let expenses = []; // Módulo de Despesas Operacionais
let auditLogs = []; // Auditoria de Ações
let cart = [];
let activeGlobalCompany = "ALL";
let lastGeneratedOrderId = null;
let monthlyGoalsMap = {}; // Metas por fornecedor/representada
let representativeLogoUrl = ""; // Logo da sua empresa

// ESTADO PARA VISÃO MESTRE (ADMIN VER TODOS OS VENDEDORES)
let isMasterView = false;
let allSellersData = [];
let activeSellerFilter = "ALL";

// INSTÂNCIAS DOS GRÁFICOS CHART.JS
let chartTopProductsInstance = null;
let chartTopClientsInstance = null;
let chartRevenueEvolutionInstance = null;

// --- GERENCIAMENTO DE TELA DE AUTENTICAÇÃO ---
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const forgotForm = document.getElementById('forgotForm');
const authAlert = document.getElementById('authAlert');
const authTitle = document.getElementById('authTitle');
const authSubtitle = document.getElementById('authSubtitle');

// --- FUNÇÕES DE MÁSCARA AUTOMÁTICA ---
function formatCpfCnpj(value) {
  const v = value.replace(/\D/g, '').slice(0, 14);
  
  if (v.length <= 11) {
    return v
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  } else {
    return v
      .replace(/^(\d{2})(\d)/, '$1.$2')
      .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d)/, '.$1/$2')
      .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
  }
}

function formatCep(value) {
  const v = value.replace(/\D/g, '').slice(0, 8);
  return v.replace(/(\d{5})(\d)/, '$1-$2');
}

function formatPhone(value) {
  const v = value.replace(/\D/g, '').slice(0, 11);
  if (v.length > 10) {
    return v
      .replace(/^(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{5})(\d)/, '$1-$2');
  } else {
    return v
      .replace(/^(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{4})(\d)/, '$1-$2');
  }
}

// --- CARREGAR DADOS SALVOS OU PARÂMETROS DA URL AO ABRIR A PÁGINA ---
window.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const paramEmail = urlParams.get('email');
  const paramPassword = urlParams.get('password');

  if (paramEmail && paramPassword) {
    document.getElementById('loginEmail').value = decodeURIComponent(paramEmail);
    document.getElementById('loginPassword').value = decodeURIComponent(paramPassword);
    
    try {
      await performLogin(decodeURIComponent(paramEmail), decodeURIComponent(paramPassword));
      return;
    } catch (err) {
      console.error("Falha no auto-login via URL:", err);
    }
  }

  const savedEmail = localStorage.getItem('savedEmail');
  if (savedEmail) {
    document.getElementById('loginEmail').value = savedEmail;
    document.getElementById('rememberMe').checked = true;
  }
  
  initReportDates();
  initExpenseDate();
  initShipmentDate();

  const maskConfigs = [
    { ids: ['clientCnpj', 'supplierCnpj', 'editClientCnpj', 'editSupplierCnpj'], fn: formatCpfCnpj },
    { ids: ['clientCep', 'supplierCep', 'editClientCep', 'editSupplierCep'], fn: formatCep },
    { 
      ids: [
        'clientPhone', 'clientWhatsapp', 'editClientPhone', 'editClientWhatsapp', 
        'supplierContact', 'supplierWhatsapp', 'editSupplierContact', 'editSupplierWhatsapp'
      ], 
      fn: formatPhone 
    }
  ];

  maskConfigs.forEach(group => {
    group.ids.forEach(id => {
      const input = document.getElementById(id);
      if (input) {
        input.addEventListener('input', (e) => {
          const cursorPos = e.target.selectionStart;
          const oldLength = e.target.value.length;
          
          e.target.value = group.fn(e.target.value);
          
          const newLength = e.target.value.length;
          const diff = newLength - oldLength;
          if (cursorPos + diff > 0) {
            try {
              e.target.setSelectionRange(cursorPos + diff, cursorPos + diff);
            } catch (err) {}
          }
        });
      }
    });
  });
});

function showAlert(msg, type = 'error') {
  authAlert.innerText = msg;
  authAlert.className = `alert-message ${type}`;
  authAlert.classList.remove('hidden');
}

function clearAlert() {
  authAlert.innerText = '';
  authAlert.classList.add('hidden');
}

document.getElementById('linkIrCadastrar').addEventListener('click', (e) => {
  e.preventDefault(); clearAlert();
  authTitle.innerText = "Novo Cadastro";
  authSubtitle.innerText = "Crie sua conta auxiliar vinculada ao seu vendedor principal";
  loginForm.classList.add('hidden'); forgotForm.classList.add('hidden');
  registerForm.classList.remove('hidden');
});

document.getElementById('linkIrLogin').addEventListener('click', (e) => {
  e.preventDefault(); clearAlert();
  authTitle.innerText = "Painel do Representante";
  authSubtitle.innerText = "Acesse sua conta para gerenciar pedidos e comissões";
  registerForm.classList.add('hidden'); forgotForm.classList.add('hidden');
  loginForm.classList.remove('hidden');
});

document.getElementById('linkEsqueciSenha').addEventListener('click', (e) => {
  e.preventDefault(); clearAlert();
  authTitle.innerText = "Recuperar Senha";
  authSubtitle.innerText = "Digite seu e-mail para receber um link de redefinição";
  loginForm.classList.add('hidden'); registerForm.classList.add('hidden');
  forgotForm.classList.remove('hidden');
});

document.getElementById('linkVoltarLogin').addEventListener('click', (e) => {
  e.preventDefault();
  document.getElementById('linkIrLogin').click();
});

// --- FUNÇÃO CENTRALIZADA DE LOGIN ---
async function performLogin(email, password) {
  const userCredential = await auth.signInWithEmailAndPassword(email, password);
  const firebaseUser = userCredential.user;

  const userRef = db.collection('usuarios').doc(firebaseUser.uid);
  let userDoc = await userRef.get();

  if (!userDoc.exists) {
    const defaultAdminData = {
      uid: firebaseUser.uid,
      nome: email.split('@')[0].toUpperCase(),
      email: email,
      status: 'ATIVO',
      perfil: 'admin',
      representadasLiberadas: [],
      dataCriacao: new Date().toISOString()
    };
    await userRef.set(defaultAdminData);
    userDoc = await userRef.get();
  }

  const userData = userDoc.data();

  if (userData.status === 'PENDENTE') {
    await auth.signOut();
    showAlert("Sua conta foi criada, mas aguarda aprovação do administrador.", "amber");
    return;
  }

  if (userData.status === 'BLOQUEADO') {
    await auth.signOut();
    showAlert("Sua conta está bloqueada.");
    return;
  }

  currentUser = { 
    uid: firebaseUser.uid, 
    email: firebaseUser.email, 
    name: userData.nome || email.split('@')[0].toUpperCase() 
  };
  userProfile = userData;

  document.getElementById('currentUserName').innerText = currentUser.name;
  document.getElementById('currentUserEmail').innerText = currentUser.email;

  if (userData.perfil === 'admin') {
    document.getElementById('adminBadge').classList.remove('hidden');
    document.getElementById('btnAdminPanel').classList.remove('hidden');
    
    if (currentUser.email === 'paulovictordaluz@yahoo.com.br') {
      document.getElementById('btnMasterToggle').classList.remove('hidden');
    } else {
      document.getElementById('btnMasterToggle').classList.add('hidden');
    }
  } else if (userData.perfil === 'gerente') {
    document.getElementById('adminBadge').classList.remove('hidden');
    document.getElementById('btnAdminPanel').classList.add('hidden');
    document.getElementById('btnMasterToggle').classList.add('hidden');
  } else {
    document.getElementById('adminBadge').classList.add('hidden');
    document.getElementById('btnAdminPanel').classList.add('hidden');
    document.getElementById('btnMasterToggle').classList.add('hidden');
  }

  document.getElementById('authScreen').classList.add('hidden');
  document.getElementById('appScreen').classList.remove('hidden');

  logAuditAction('LOGIN', `Usuário ${currentUser.email} realizou login no sistema.`);

  if (userData.perfil === 'admin' || userData.perfil === 'gerente') {
    await loadAllSellersMasterData();
    updateSelectOptions();
    renderAllViews();
    updateFirstDueDate(30);
  } else {
    await loadUserData();
  }

  checkBackupReminder();
}

// --- REGISTRO DE AUDITORIA E LOGS ---
async function logAuditAction(actionType, description) {
  const logEntry = {
    id: Date.now(),
    user: currentUser ? currentUser.email : 'Sistema',
    type: actionType,
    description: description,
    timestamp: new Date().toISOString()
  };
  auditLogs.push(logEntry);
  if (auditLogs.length > 200) auditLogs.shift(); // Limita o histórico local
}

// --- LOGIN, CADASTRO E RECUPERAÇÃO ---
loginForm.addEventListener('submit', async function(e) {
  e.preventDefault();
  clearAlert();
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value.trim();
  const rememberMe = document.getElementById('rememberMe').checked;

  if (rememberMe) {
    localStorage.setItem('savedEmail', email);
  } else {
    localStorage.removeItem('savedEmail');
  }

  try {
    await performLogin(email, password);
  } catch (error) {
    console.error("Erro no login:", error);
    let msg = "E-mail ou senha incorretos.";
    if (error.code === 'auth/user-not-found') {
      msg = "Usuário não encontrado.";
    } else if (error.code === 'auth/wrong-password') {
      msg = "Senha incorreta.";
    } else if (error.code === 'auth/invalid-email') {
      msg = "E-mail com formato inválido.";
    }
    showAlert(msg);
  }
});

registerForm.addEventListener('submit', async function(e) {
  e.preventDefault();
  clearAlert();
  const name = document.getElementById('cadNome').value.trim();
  const email = document.getElementById('cadEmail').value.trim();
  const vendedorPrincipalEmail = (document.getElementById('cadCompanyCode')?.value || '').trim().toLowerCase();
  const password = document.getElementById('cadPassword').value.trim();

  try {
    const userCredential = await auth.createUserWithEmailAndPassword(email, password);
    const firebaseUser = userCredential.user;

    await db.collection('usuarios').doc(firebaseUser.uid).set({
      uid: firebaseUser.uid,
      nome: name,
      email: email,
      vendedorPrincipalEmail: vendedorPrincipalEmail,
      status: 'PENDENTE',
      perfil: 'vendedor',
      representadasLiberadas: [],
      dataCriacao: new Date().toISOString()
    });

    await auth.signOut();
    showAlert("Cadastro solicitado com sucesso! Aguarde aprovação do administrador.", "green");
    registerForm.reset();
  } catch (error) {
    let msg = "Erro ao cadastrar: " + error.message;
    if (error.code === 'auth/email-already-in-use') {
      msg = "Este e-mail já está cadastrado no sistema.";
    } else if (error.code === 'auth/weak-password') {
      msg = "A senha deve ter pelo menos 6 caracteres.";
    } else if (error.code === 'auth/invalid-email') {
      msg = "Por favor, insira um e-mail válido.";
    }
    showAlert(msg, "error");
  }
});

forgotForm.addEventListener('submit', async function(e) {
  e.preventDefault();
  clearAlert();
  const email = document.getElementById('recuperaEmail').value.trim();

  try {
    await auth.sendPasswordResetEmail(email);
    showAlert("E-mail de redefinição enviado com sucesso!", "green");
    forgotForm.reset();
  } catch (error) {
    showAlert("Erro ao enviar e-mail: " + error.message);
  }
});

function logout() {
  logAuditAction('LOGOUT', `Usuário ${currentUser ? currentUser.email : ''} saiu do sistema.`);
  auth.signOut();
  currentUser = null; userProfile = null;
  suppliers = []; clients = []; products = []; orders = []; installments = []; expenses = []; auditLogs = []; cart = []; monthlyGoalsMap = {};
  representativeLogoUrl = "";
  activeGlobalCompany = "ALL";
  isMasterView = false;
  allSellersData = [];
  document.getElementById('appScreen').classList.add('hidden');
  document.getElementById('authScreen').classList.remove('hidden');
  
  const savedEmail = localStorage.getItem('savedEmail');
  loginForm.reset();
  if (savedEmail) {
    document.getElementById('loginEmail').value = savedEmail;
    document.getElementById('rememberMe').checked = true;
  }
}

// --- DRAG AND DROP E CONVERSÃO DE IMAGEM PARA BASE64 ---
function handleDragOver(e) {
  e.preventDefault();
  e.stopPropagation();
  e.currentTarget.classList.add('dragover');
}

function handleDragLeave(e) {
  e.preventDefault();
  e.stopPropagation();
  e.currentTarget.classList.remove('dragover');
}

function handleDrop(e, prefix) {
  e.preventDefault();
  e.stopPropagation();
  e.currentTarget.classList.remove('dragover');

  const files = e.dataTransfer.files;
  if (files && files.length > 0) {
    processImageFile(files[0], prefix);
  }
}

function handleFileSelect(e, prefix) {
  const files = e.target.files;
  if (files && files.length > 0) {
    processImageFile(files[0], prefix);
  }
}

function processImageFile(file, prefix) {
  if (!file.type.startsWith('image/')) {
    alert("Por favor, selecione apenas arquivos de imagem.");
    return;
  }

  const reader = new FileReader();
  reader.onload = function(event) {
    const img = new Image();
    img.onload = function() {
      const MAX_WIDTH = 200;
      const MAX_HEIGHT = 200;
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > MAX_WIDTH) {
          height *= MAX_WIDTH / width;
          width = MAX_WIDTH;
        }
      } else {
        if (height > MAX_HEIGHT) {
          width *= MAX_HEIGHT / height;
          height = MAX_HEIGHT;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      const compressedBase64 = canvas.toDataURL('image/jpeg', 0.75);

      document.getElementById(`${prefix}LogoUrl`).value = compressedBase64;
      const previewImg = document.getElementById(`${prefix}LogoPreview`);
      const dropText = document.getElementById(`${prefix}DropText`);
      
      if (previewImg) {
        previewImg.src = compressedBase64;
        previewImg.classList.remove('hidden');
      }
      if (dropText) dropText.classList.add('hidden');
    };
    img.src = event.target.result;
  };
  reader.readAsDataURL(file);
}

function setLogoPreviewState(prefix, url) {
  const previewImg = document.getElementById(`${prefix}LogoPreview`);
  const dropText = document.getElementById(`${prefix}DropText`);
  const hiddenInput = document.getElementById(`${prefix}LogoUrl`);

  if (hiddenInput) hiddenInput.value = url || '';

  if (url) {
    if (previewImg) {
      previewImg.src = url;
      previewImg.classList.remove('hidden');
    }
    if (dropText) dropText.classList.add('hidden');
  } else {
    if (previewImg) {
      previewImg.src = '';
      previewImg.classList.add('hidden');
    }
    if (dropText) dropText.classList.remove('hidden');
  }
}

// --- CONFIGURAÇÃO DA LOGO DA EMPRESA (REPRESENTANTE) ---
function openRepresentativeLogoModal() {
  setLogoPreviewState('repLogo', representativeLogoUrl);
  document.getElementById('representativeLogoModal').classList.remove('hidden');
}

function closeRepresentativeLogoModal() {
  document.getElementById('representativeLogoModal').classList.add('hidden');
}

async function saveRepresentativeLogo() {
  const url = document.getElementById('repLogoLogoUrl').value || '';
  representativeLogoUrl = url;
  closeRepresentativeLogoModal();
  await saveUserData();
  alert("Logo da empresa salva com sucesso!");
}

// --- CARREGAMENTO DE DADOS COM SUPORTE A AUXILIARES E RESTRIÇÃO POR REPRESENTADA ---
async function loadUserData() {
  if (!currentUser) return;
  try {
    if (userProfile && (userProfile.perfil === 'admin' || userProfile.perfil === 'gerente')) {
      await loadAllSellersMasterData();
    } else {
      const targetEmail = (userProfile && userProfile.vendedorPrincipalEmail) 
        ? userProfile.vendedorPrincipalEmail.toLowerCase() 
        : currentUser.email.toLowerCase();

      const docRef = db.collection('vendedores').doc(targetEmail);
      const docSnap = await docRef.get();

      if (docSnap.exists) {
        const userData = docSnap.data();
        let rawSuppliers = userData.suppliers || [];
        representativeLogoUrl = userData.representativeLogoUrl || '';
        
        if (userProfile.representadasLiberadas && userProfile.representadasLiberadas.length > 0) {
          suppliers = rawSuppliers.filter(s => userProfile.representadasLiberadas.includes(s.id.toString()));
          const allowedSuppIds = new Set(suppliers.map(s => s.id.toString()));
          
          orders = (userData.orders || []).filter(o => allowedSuppIds.has(o.supplierId.toString()));
          installments = (userData.installments || []).filter(i => allowedSuppIds.has(i.supplierId.toString()));
          products = (userData.products || []);
        } else {
          suppliers = rawSuppliers;
          orders = userData.orders || [];
          installments = userData.installments || [];
          products = userData.products || [];
        }

        clients = userData.clients || [];
        expenses = userData.expenses || [];
        auditLogs = userData.auditLogs || [];
        monthlyGoalsMap = userData.monthlyGoalsMap || {};
      } else {
        suppliers = []; clients = []; products = []; orders = []; installments = []; expenses = []; auditLogs = []; monthlyGoalsMap = {}; representativeLogoUrl = '';
      }
    }

    updateSelectOptions();
    renderAllViews();
    updateFirstDueDate(30);
  } catch (error) {
    console.error("Erro ao carregar dados do Firebase:", error);
    alert("Erro ao conectar ao banco de dados Firestore.");
  }
}

async function loadAllSellersMasterData() {
  try {
    const isAdminGlobal = (currentUser.email === 'paulovictordaluz@yahoo.com.br' || (userProfile && userProfile.perfil === 'admin' && isMasterView));
    
    let emailsParaBuscar = [];
    if (isAdminGlobal && isMasterView) {
      const snapUsuarios = await db.collection('usuarios').get();
      snapUsuarios.forEach(doc => emailsParaBuscar.push(doc.id));
    } else {
      const gerenteEmail = currentUser.email.toLowerCase();
      emailsParaBuscar.push(gerenteEmail);

      const snapUsuarios = await db.collection('usuarios').where('vendedorPrincipalEmail', '==', gerenteEmail).get();
      snapUsuarios.forEach(doc => {
        const dados = doc.data();
        if (dados.email) emailsParaBuscar.push(dados.email.toLowerCase());
      });
    }

    let combinedSuppliersMap = new Map();
    let combinedClientsMap = new Map();
    let combinedProductsMap = new Map();
    let combinedOrders = [];
    let combinedInstallments = [];
    let combinedExpenses = [];
    let combinedLogs = [];
    let combinedGoals = {};
    let repLogoFound = "";
    allSellersData = [];

    for (let email of emailsParaBuscar) {
      const docRef = db.collection('vendedores').doc(email);
      const docSnap = await docRef.get();
      if (docSnap.exists) {
        const data = docSnap.data();
        allSellersData.push({ email: email, name: email.split('@')[0].toUpperCase() });
        if (data.representativeLogoUrl && !repLogoFound) repLogoFound = data.representativeLogoUrl;

        (data.suppliers || []).forEach(s => combinedSuppliersMap.set(s.id.toString(), s));
        (data.clients || []).forEach(c => combinedClientsMap.set(c.id.toString(), c));
        (data.products || []).forEach(p => combinedProductsMap.set(p.id.toString(), p));
        Object.assign(combinedGoals, data.monthlyGoalsMap || {});

        (data.expenses || []).forEach(ex => combinedExpenses.push(ex));
        (data.auditLogs || []).forEach(lg => combinedLogs.push(lg));

        (data.orders || []).forEach(o => {
          if (!o.sellerEmail) o.sellerEmail = email;
          if (!combinedOrders.some(existing => existing.id.toString() === o.id.toString())) {
            combinedOrders.push(o);
          }
        });

        (data.installments || []).forEach(inst => {
          if (!inst.sellerEmail) inst.sellerEmail = email;
          if (!combinedInstallments.some(existing => existing.id.toString() === inst.id.toString())) {
            combinedInstallments.push(inst);
          }
        });
      }
    }

    suppliers = Array.from(combinedSuppliersMap.values());
    clients = Array.from(combinedClientsMap.values());
    products = Array.from(combinedProductsMap.values());
    orders = combinedOrders;
    installments = combinedInstallments;
    expenses = combinedExpenses;
    auditLogs = combinedLogs;
    monthlyGoalsMap = combinedGoals;
    representativeLogoUrl = repLogoFound;

  } catch (err) {
    console.error("Erro ao carregar dados mestre:", err);
  }
}

async function toggleMasterView() {
  if (!userProfile || userProfile.perfil !== 'admin') return;
  isMasterView = !isMasterView;
  const masterBadge = document.getElementById('masterBadge');
  const btnToggle = document.getElementById('btnMasterToggle');
  const reportSellerGroup = document.getElementById('reportSellerGroup');

  if (isMasterView) {
    masterBadge.classList.remove('hidden');
    btnToggle.innerText = "👤 Minha Visão (Vendedor)";
    btnToggle.style.backgroundColor = "#f59e0b";
    btnToggle.style.color = "#ffffff";
    if (reportSellerGroup) reportSellerGroup.classList.remove('hidden');
  } else {
    masterBadge.classList.add('hidden');
    btnToggle.innerText = "🔑 Visão Mestre (Todos)";
    btnToggle.style.backgroundColor = "#e2e8f0";
    btnToggle.style.color = "#334155";
    if (reportSellerGroup) reportSellerGroup.classList.add('hidden');
  }

  await loadUserData();
}

async function saveUserData() {
  if (!currentUser) return;
  try {
    const targetEmail = (userProfile && userProfile.vendedorPrincipalEmail) 
      ? userProfile.vendedorPrincipalEmail.toLowerCase() 
      : currentUser.email.toLowerCase();

    const userData = { 
      suppliers: suppliers, 
      clients: clients, 
      products: products, 
      orders: orders, 
      installments: installments,
      expenses: expenses,
      auditLogs: auditLogs,
      monthlyGoalsMap: monthlyGoalsMap,
      representativeLogoUrl: representativeLogoUrl
    };
    await db.collection('vendedores').doc(targetEmail).set(userData, { merge: true });
    renderAllViews();
  } catch (error) {
    console.error("Erro ao salvar dados no Firebase:", error);
    alert("Erro ao salvar informações no banco de dados.");
  }
}

function onGlobalCompanyChange() {
  activeGlobalCompany = document.getElementById('globalCompanySelect').value;
  renderAllViews();
}

function renderAllViews() {
  renderSuppliers();
  renderClients();
  renderProducts();
  renderOrdersHistory();
  renderFinancialTable();
  renderExpenses();
  renderReports();
  updateDashboardMetrics();
}

// --- CONFIGURAÇÃO DE METAS MENSAIS POR REPRESENTADA ---
function setMonthlyGoalPrompt() {
  const currentKey = activeGlobalCompany;
  const currentGoalObj = monthlyGoalsMap[currentKey] || { target: 50000 };
  const currentTarget = currentGoalObj.target || 50000;

  const compName = currentKey === 'ALL' ? 'Geral (Todas as Representadas)' : (suppliers.find(s => s.id.toString() === currentKey.toString())?.name || currentKey);
  const promptMsg = `Defina o valor da Meta Comercial Mensal para: ${compName}\n(R$):`;
  const inputVal = prompt(promptMsg, currentTarget);

  if (inputVal !== null) {
    const parsed = parseFloat(inputVal.replace(',', '.'));
    if (!isNaN(parsed) && parsed >= 0) {
      if (!monthlyGoalsMap[currentKey]) monthlyGoalsMap[currentKey] = {};
      monthlyGoalsMap[currentKey].target = parsed;
      saveUserData();
      updateDashboardMetrics();
      alert("Meta mensal atualizada com sucesso!");
    } else {
      alert("Valor inválido.");
    }
  }
}

// --- BUSCA AUTOMÁTICA DE CNPJ VIA API (BrasilAPI) COM TRATAMENTO DE ERRO ROBUSTO E VALIDAÇÃO DE DUPLICIDADE ---
async function searchCnpj(type) {
  const cnpjInput = document.getElementById(`${type}Cnpj`);
  const valorDoc = cnpjInput.value.replace(/\D/g, '');

  if (valorDoc.length !== 14 && valorDoc.length !== 11) {
    alert("Digite um CPF ou CNPJ válido.");
    return;
  }

  if (type === 'supplier' || type === 'editSupplier') {
    const existe = suppliers.some(s => s.cnpj && s.cnpj.replace(/\D/g, '') === valorDoc);
    if (existe) {
      alert("⚠️ Atenção: Este fornecedor/representada já está cadastrado no sistema!");
      cnpjInput.value = "";
      return;
    }
  } else if (type === 'client' || type === 'editClient') {
    const existe = clients.some(c => c.cnpj && c.cnpj.replace(/\D/g, '') === valorDoc);
    if (existe) {
      alert("⚠️ Atenção: Este cliente já consta na sua carteira de cadastros!");
      cnpjInput.value = "";
      return;
    }
  }

  if (valorDoc.length === 14) {
    try {
      const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${valorDoc}`);
      if (!res.ok) throw new Error("CNPJ não encontrado.");
      const data = await res.json();

      document.getElementById(`${type}Name`).value = data.razao_social || data.nome_fantasia || '';
      const cepField = document.getElementById(`${type}Cep`);
      if (cepField) {
        cepField.value = formatCep(data.cep || '');
      }
      document.getElementById(`${type}Address`).value = data.logradouro || '';
      const numField = document.getElementById(`${type}Number`);
      if (numField) numField.value = data.numero || '';
      
      document.getElementById(`${type}Neighborhood`).value = data.bairro || '';
      document.getElementById(`${type}City`).value = `${data.municipio}/${data.uf}`;
      
      if (document.getElementById(`${type}Contact`)) {
        document.getElementById(`${type}Contact`).value = formatPhone(data.ddd_telefone_1 || '');
      } else if (document.getElementById(`${type}Phone`)) {
        document.getElementById(`${type}Phone`).value = formatPhone(data.ddd_telefone_1 || '');
      }

      alert("Dados do CNPJ preenchidos automaticamente!");
    } catch (e) {
      console.warn("Falha ao consultar API de CNPJ:", e.message);
      alert("Não foi possível buscar automaticamente os dados do CNPJ no momento. Você pode preencher os campos manualmente.");
    }
  }
}

// --- LEMBRETE PERIÓDICO DE BACKUP AUTOMÁTICO (60 dias) ---
function checkBackupReminder() {
  const lastBackupDate = localStorage.getItem('lastBackupReminder');
  const todayStr = new Date().toISOString().slice(0, 10);

  if (!lastBackupDate || (new Date(todayStr) - new Date(lastBackupDate)) / (1000 * 60 * 60 * 24) >= 60) {
    setTimeout(() => {
      const fazerBackup = confirm("💡 Dica de Segurança: Já faz algum tempo desde o seu último backup. Deseja exportar o arquivo JSON de segurança agora?");
      if (fazerBackup) {
        exportDataBackup();
      }
      localStorage.setItem('lastBackupReminder', todayStr);
    }, 2000);
  }
}

async function searchCep(type) {
  const cepInput = document.getElementById(`${type}Cep`);
  const cep = cepInput.value.replace(/\D/g, '');

  if (cep.length !== 8) {
    alert("Digite um CEP válido com 8 dígitos.");
    return;
  }

  try {
    const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    const data = await res.json();

    if (data.erro) {
      alert("CEP não encontrado.");
      return;
    }

    document.getElementById(`${type}Address`).value = data.logradouro || '';
    document.getElementById(`${type}Neighborhood`).value = data.bairro || '';
    document.getElementById(`${type}City`).value = `${data.localidade}/${data.uf}`;
  } catch (e) {
    alert("Falha ao consultar o CEP.");
  }
}

function switchTab(tabId, event) {
  document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));

  document.getElementById(tabId).classList.add('active');
  if (event) event.currentTarget.classList.add('active');

  if (tabId === 'dashboard') {
    setTimeout(updateDashboardMetrics, 50);
  }
}

// --- CADASTRO DE FORNECEDORES ---
document.getElementById('supplierForm').addEventListener('submit', async function(e) {
  e.preventDefault();
  const supplier = {
    id: Date.now(),
    name: document.getElementById('supplierName').value,
    cnpj: document.getElementById('supplierCnpj').value,
    ie: document.getElementById('supplierIe')?.value || '',
    cep: document.getElementById('supplierCep').value,
    address: document.getElementById('supplierAddress').value,
    number: document.getElementById('supplierNumber').value,
    neighborhood: document.getElementById('supplierNeighborhood').value,
    city: document.getElementById('supplierCity').value,
    contact: document.getElementById('supplierContact')?.value || '',
    whatsapp: document.getElementById('supplierWhatsapp')?.value || '',
    logoUrl: document.getElementById('supplierLogoUrl')?.value || '',
    sellerEmail: currentUser ? currentUser.email : ''
  };

  suppliers.push(supplier);
  logAuditAction('CRIAR_FORNECEDOR', `Cadastrou o fornecedor: ${supplier.name}`);
  await saveUserData();
  updateSelectOptions();
  this.reset();
  setLogoPreviewState('supplier', '');
});

function renderSuppliers() {
  const tbody = document.getElementById('suppliersTableBody');
  const search = (document.getElementById('searchSupplierInput')?.value || '').toLowerCase();
  
  const filtered = suppliers.filter(s => {
    const matchesGlobal = activeGlobalCompany === 'ALL' || s.id.toString() === activeGlobalCompany.toString();
    const matchesSearch = s.name.toLowerCase().includes(search) || s.cnpj.includes(search);
    return matchesGlobal && matchesSearch;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="7">Nenhum fornecedor encontrado.</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(s => {
    const fullAddress = `${s.address || ''}, nº ${s.number || ''}, ${s.neighborhood || ''} - ${s.city || ''}`.trim();
    const mapsQuery = encodeURIComponent(fullAddress);
    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${mapsQuery}`;

    const phonesDisplay = `
      ${s.contact ? 'Tel: ' + s.contact : ''}
      ${s.contact && s.whatsapp ? '<br>' : ''}
      ${s.whatsapp ? 'Whats: ' + s.whatsapp : ''}
      ${!s.contact && !s.whatsapp ? '-' : ''}
    `;

    return `
      <tr>
        <td>#${s.id.toString().slice(-4)}</td>
        <td><strong>${s.name}</strong></td>
        <td>${s.cnpj}</td>
        <td>${s.address || '-'}, ${s.number || 'S/N'}, ${s.neighborhood || '-'}</td>
        <td>
          ${s.city} 
          <a href="${mapsUrl}" target="_blank" title="Abrir localização no Google Maps" style="margin-left: 6px; font-size: 0.85rem; text-decoration: none;" class="badge badge-blue">🗺️ Mapa</a>
        </td>
        <td>${phonesDisplay}</td>
        <td>
          <div style="display: flex; gap: 6px;">
            <button class="btn-secondary" onclick="openEditSupplierModal(${s.id})">✏️ Editar</button>
            <button class="btn-danger" onclick="deleteSupplier(${s.id})">Excluir</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function openEditSupplierModal(id) {
  const supplier = suppliers.find(s => s.id === id);
  if (!supplier) return;

  document.getElementById('editSupplierId').value = supplier.id;
  document.getElementById('editSupplierCnpj').value = supplier.cnpj || '';
  document.getElementById('editSupplierName').value = supplier.name || '';
  document.getElementById('editSupplierIe').value = supplier.ie || '';
  document.getElementById('editSupplierCep').value = supplier.cep || '';
  document.getElementById('editSupplierAddress').value = supplier.address || '';
  document.getElementById('editSupplierNumber').value = supplier.number || '';
  document.getElementById('editSupplierNeighborhood').value = supplier.neighborhood || '';
  document.getElementById('editSupplierCity').value = supplier.city || '';
  
  if (document.getElementById('editSupplierContact')) {
    document.getElementById('editSupplierContact').value = supplier.contact || '';
  }
  if (document.getElementById('editSupplierWhatsapp')) {
    document.getElementById('editSupplierWhatsapp').value = supplier.whatsapp || '';
  }
  
  setLogoPreviewState('editSupplier', supplier.logoUrl || '');
  document.getElementById('editSupplierModal').classList.remove('hidden');
}

function closeEditSupplierModal() {
  document.getElementById('editSupplierModal').classList.add('hidden');
}

async function saveEditedSupplier(e) {
  e.preventDefault();
  const id = parseInt(document.getElementById('editSupplierId').value);
  const supplier = suppliers.find(s => s.id === id);
  if (!supplier) return;

  supplier.cnpj = document.getElementById('editSupplierCnpj').value;
  supplier.name = document.getElementById('editSupplierName').value;
  supplier.ie = document.getElementById('editSupplierIe').value;
  supplier.cep = document.getElementById('editSupplierCep').value;
  supplier.address = document.getElementById('editSupplierAddress').value;
  supplier.number = document.getElementById('editSupplierNumber').value;
  supplier.neighborhood = document.getElementById('editSupplierNeighborhood').value;
  supplier.city = document.getElementById('editSupplierCity').value;
  
  if (document.getElementById('editSupplierContact')) {
    supplier.contact = document.getElementById('editSupplierContact').value;
  }
  if (document.getElementById('editSupplierWhatsapp')) {
    supplier.whatsapp = document.getElementById('editSupplierWhatsapp').value;
  }
  
  if (document.getElementById('editSupplierLogoUrl')) {
    supplier.logoUrl = document.getElementById('editSupplierLogoUrl').value;
  }

  logAuditAction('EDITAR_FORNECEDOR', `Atualizou o fornecedor ID #${id}`);
  closeEditSupplierModal();
  await saveUserData();
  updateSelectOptions();
  alert("Fornecedor atualizado com sucesso!");
}

async function deleteSupplier(id) {
  if (confirm("Remover este fornecedor?")) {
    logAuditAction('EXCLUIR_FORNECEDOR', `Excluiu o fornecedor ID #${id}`);
    suppliers = suppliers.filter(s => s.id !== id);
    if (activeGlobalCompany === id.toString()) {
      activeGlobalCompany = "ALL";
      document.getElementById('globalCompanySelect').value = "ALL";
    }
    await saveUserData();
    updateSelectOptions();
  }
}

// --- CADASTRO DE CLIENTES COM GEOLOCALIZAÇÃO (GOOGLE MAPS) E HISTÓRICO ---
document.getElementById('clientForm').addEventListener('submit', async function(e) {
  e.preventDefault();
  const client = {
    id: Date.now(),
    name: document.getElementById('clientName').value,
    cnpj: document.getElementById('clientCnpj').value,
    ie: document.getElementById('clientIe')?.value || '',
    email: document.getElementById('clientEmail').value,
    phone: document.getElementById('clientPhone')?.value || '',
    whatsapp: document.getElementById('clientWhatsapp')?.value || '',
    contactPerson: document.getElementById('clientContactPerson')?.value || '',
    cep: document.getElementById('clientCep').value,
    address: document.getElementById('clientAddress').value,
    number: document.getElementById('clientNumber').value,
    neighborhood: document.getElementById('clientNeighborhood').value,
    city: document.getElementById('clientCity').value,
    creditLimit: parseFloat(document.getElementById('clientCreditLimit')?.value) || 0,
    sellerEmail: currentUser ? currentUser.email : ''
  };

  clients.push(client);
  logAuditAction('CRIAR_CLIENTE', `Cadastrou o cliente: ${client.name}`);
  await saveUserData();
  updateSelectOptions();
  this.reset();
});

function renderClients() {
  const tbody = document.getElementById('clientsTableBody');
  const search = (document.getElementById('searchClientInput')?.value || '').toLowerCase();
  
  let allowedClientIds = null;
  if (activeGlobalCompany !== 'ALL') {
    allowedClientIds = new Set();
    orders.filter(o => o.supplierId.toString() === activeGlobalCompany.toString()).forEach(o => {
      (o.clientIds || []).forEach(cid => allowedClientIds.add(cid.toString()));
    });
  }

  const filtered = clients.filter(c => {
    const matchesGlobal = allowedClientIds === null || allowedClientIds.has(c.id.toString());
    const matchesSearch = c.name.toLowerCase().includes(search) || c.cnpj.includes(search) || (c.email && c.email.toLowerCase().includes(search));
    return matchesGlobal && matchesSearch;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="8">Nenhum cliente na carteira para o filtro selecionado.</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(c => {
    const clientOrders = orders.filter(o => {
      const matchSup = activeGlobalCompany === 'ALL' || o.supplierId.toString() === activeGlobalCompany.toString();
      const matchCli = o.clientIds && o.clientIds.includes(c.id.toString());
      return matchSup && matchCli;
    });
    const totalSpent = clientOrders.reduce((acc, o) => acc + o.total, 0);

    const fullAddress = `${c.address || ''}, nº ${c.number || ''}, ${c.neighborhood || ''} - ${c.city || ''}`.trim();
    const mapsQuery = encodeURIComponent(fullAddress);
    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${mapsQuery}`;

    const phonesDisplay = `
      ${c.phone ? 'Tel: ' + c.phone : ''}
      ${c.phone && c.whatsapp ? '<br>' : ''}
      ${c.whatsapp ? 'Whats: ' + c.whatsapp : ''}
      ${!c.phone && !c.whatsapp ? '-' : ''}
    `;

    return `
      <tr>
        <td>#${c.id.toString().slice(-4)}</td>
        <td><a href="#" onclick="openClientHistoryModal(${c.id}); return false;" style="color: #0284c7; font-weight: bold; text-decoration: none;">${c.name} 📋</a></td>
        <td>${c.cnpj}</td>
        <td>${c.email || '-'}</td>
        <td>
          ${c.city} 
          <a href="${mapsUrl}" target="_blank" title="Abrir localização no Google Maps" style="margin-left: 6px; font-size: 0.85rem; text-decoration: none;" class="badge badge-blue">🗺️ Mapa</a>
        </td>
        <td>${phonesDisplay}${c.contactPerson ? '<br><small>(' + c.contactPerson + ')</small>' : ''}</td>
        <td>${clientOrders.length} pedido(s) (${formatCurrency(totalSpent)})</td>
        <td>
          <div style="display: flex; gap: 6px;">
            <button class="btn-secondary" onclick="openEditClientModal(${c.id})">✏️ Editar</button>
            <button class="btn-danger" onclick="deleteClient(${c.id})">Excluir</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function openClientHistoryModal(clientId) {
  const client = clients.find(c => c.id.toString() === clientId.toString());
  if (!client) return;

  const phoneInfo = client.whatsapp ? `Whats: ${client.whatsapp}` : (client.phone ? `Tel: ${client.phone}` : '-');
  document.getElementById('clientHistoryTitle').innerText = `Ficha do Cliente: ${client.name}`;
  document.getElementById('clientHistorySub').innerText = `CNPJ/CPF: ${client.cnpj} | E-mail: ${client.email || '-'} | ${phoneInfo}`;

  const clientOrders = orders.filter(o => o.clientIds && o.clientIds.includes(client.id.toString()));
  const totalSpent = clientOrders.reduce((acc, o) => acc + o.total, 0);
  const totalItemsCount = clientOrders.reduce((acc, o) => acc + (o.items || []).reduce((sum, i) => sum + i.qty, 0), 0);

  const metricsDiv = document.getElementById('clientHistoryMetrics');
  metricsDiv.innerHTML = `
    <div class="card-metric" style="padding: 15px;">
      <h3>Total Comprado</h3>
      <p style="font-size: 1.4rem;">${formatCurrency(totalSpent)}</p>
    </div>
    <div class="card-metric green" style="padding: 15px;">
      <h3>Pedidos Realizados</h3>
      <p style="font-size: 1.4rem;">${clientOrders.length}</p>
    </div>
    <div class="card-metric amber" style="padding: 15px;">
      <h3>Itens Adquiridos</h3>
      <p style="font-size: 1.4rem;">${totalItemsCount} unid.</p>
    </div>
  `;

  const tbody = document.getElementById('clientHistoryTableBody');
  if (clientOrders.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="6">Nenhum pedido registrado para este cliente.</td></tr>';
  } else {
    tbody.innerHTML = clientOrders.map(o => {
      const supp = suppliers.find(s => s.id.toString() === o.supplierId.toString());
      const itemsDesc = (o.items || []).map(i => `${i.qty}x ${i.name}`).join(', ');
      return `
        <tr>
          <td><strong>#${o.id.toString().slice(-6)}</strong></td>
          <td>${o.date}</td>
          <td>${supp ? supp.name : '-'}</td>
          <td style="max-width: 250px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${itemsDesc}">${itemsDesc}</td>
          <td><strong>${formatCurrency(o.total)}</strong></td>
          <td><span class="badge ${o.envioStatus === 'Enviado' ? 'badge-green' : 'badge-amber'}">${o.envioStatus || 'Rascunho'}</span></td>
        </tr>
      `;
    }).join('');
  }

  document.getElementById('clientHistoryModal').classList.remove('hidden');
}

function closeClientHistoryModal() {
  document.getElementById('clientHistoryModal').classList.add('hidden');
}

function openEditClientModal(id) {
  const client = clients.find(c => c.id === id);
  if (!client) return;

  document.getElementById('editClientId').value = client.id;
  document.getElementById('editClientCnpj').value = client.cnpj || '';
  document.getElementById('editClientName').value = client.name || '';
  document.getElementById('editClientIe').value = client.ie || '';
  document.getElementById('editClientEmail').value = client.email || '';
  
  if (document.getElementById('editClientPhone')) {
    document.getElementById('editClientPhone').value = client.phone || '';
  }
  if (document.getElementById('editClientWhatsapp')) {
    document.getElementById('editClientWhatsapp').value = client.whatsapp || '';
  }

  document.getElementById('editClientContactPerson').value = client.contactPerson || '';
  document.getElementById('editClientCep').value = client.cep || '';
  document.getElementById('editClientAddress').value = client.address || '';
  document.getElementById('editClientNumber').value = client.number || '';
  document.getElementById('editClientNeighborhood').value = client.neighborhood || '';
  document.getElementById('editClientCity').value = client.city || '';
  document.getElementById('editClientCreditLimit').value = client.creditLimit || 0;

  document.getElementById('editClientModal').classList.remove('hidden');
}

function closeEditClientModal() {
  document.getElementById('editClientModal').classList.add('hidden');
}

async function saveEditedClient(e) {
  e.preventDefault();
  const id = parseInt(document.getElementById('editClientId').value);
  const client = clients.find(c => c.id === id);
  if (!client) return;

  client.cnpj = document.getElementById('editClientCnpj').value;
  client.name = document.getElementById('editClientName').value;
  client.ie = document.getElementById('editClientIe').value;
  client.email = document.getElementById('editClientEmail').value;
  
  if (document.getElementById('editClientPhone')) {
    client.phone = document.getElementById('editClientPhone').value;
  }
  if (document.getElementById('editClientWhatsapp')) {
    client.whatsapp = document.getElementById('editClientWhatsapp').value;
  }

  client.contactPerson = document.getElementById('editClientContactPerson').value;
  client.cep = document.getElementById('editClientCep').value;
  client.address = document.getElementById('editClientAddress').value;
  client.number = document.getElementById('editClientNumber').value;
  client.neighborhood = document.getElementById('editClientNeighborhood').value;
  client.city = document.getElementById('editClientCity').value;
  client.creditLimit = parseFloat(document.getElementById('editClientCreditLimit').value) || 0;

  logAuditAction('EDITAR_CLIENTE', `Atualizou o cliente ID #${id}`);
  closeEditClientModal();
  await saveUserData();
  updateSelectOptions();
  alert("Cliente atualizado com sucesso!");
}

async function deleteClient(id) {
  if (confirm("Remover este cliente?")) {
    logAuditAction('EXCLUIR_CLIENTE', `Removeu o cliente ID #${id}`);
    clients = clients.filter(c => c.id !== id);
    await saveUserData();
    updateSelectOptions();
  }
}

// --- CADASTRO DE PRODUTOS ---
document.getElementById('productForm').addEventListener('submit', async function(e) {
  e.preventDefault();
  const product = {
    id: Date.now(),
    name: document.getElementById('productName').value,
    ncm: document.getElementById('productNcm').value,
    price: parseFloat(document.getElementById('productPrice').value) || 0,
    stock: parseInt(document.getElementById('productStock').value) || 0,
    sellerEmail: currentUser ? currentUser.email : ''
  };

  products.push(product);
  logAuditAction('CRIAR_PRODUTO', `Cadastrou o produto: ${product.name}`);
  await saveUserData();
  updateSelectOptions();
  this.reset();
});

function renderProducts() {
  const tbody = document.getElementById('productsTableBody');
  const search = (document.getElementById('searchProductInput')?.value || '').toLowerCase();
  const filtered = products.filter(p => p.name.toLowerCase().includes(search));

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="6">Nenhum produto no catálogo.</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(p => `
    <tr>
      <td>#${p.id.toString().slice(-4)}</td>
      <td><strong>${p.name}</strong></td>
      <td>${p.ncm || '-'}</td>
      <td>${formatCurrency(p.price)}</td>
      <td><span style="font-weight: bold; color: ${p.stock <= 0 ? '#ef4444' : '#16a34a'}">${p.stock !== undefined ? p.stock : 0}</span></td>
      <td>
        <div style="display: flex; gap: 6px;">
          <button class="btn-secondary" onclick="openEditProductModal(${p.id})">✏️ Editar</button>
          <button class="btn-danger" onclick="deleteProduct(${p.id})">Excluir</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function openEditProductModal(id) {
  const product = products.find(p => p.id === id);
  if (!product) return;

  document.getElementById('editProductId').value = product.id;
  document.getElementById('editProductName').value = product.name;
  document.getElementById('editProductNcm').value = product.ncm || '';
  document.getElementById('editProductPrice').value = product.price;
  document.getElementById('editProductStock').value = product.stock !== undefined ? product.stock : 0;

  document.getElementById('editProductModal').classList.remove('hidden');
}

function closeEditProductModal() {
  document.getElementById('editProductModal').classList.add('hidden');
}

async function saveEditedProduct(e) {
  e.preventDefault();
  const id = parseInt(document.getElementById('editProductId').value);
  const product = products.find(p => p.id === id);
  if (!product) return;

  product.name = document.getElementById('editProductName').value;
  product.ncm = document.getElementById('editProductNcm').value;
  product.price = parseFloat(document.getElementById('editProductPrice').value) || 0;
  product.stock = parseInt(document.getElementById('editProductStock').value) || 0;

  logAuditAction('EDITAR_PRODUTO', `Atualizou o produto ID #${id}`);
  closeEditProductModal();
  await saveUserData();
  updateSelectOptions();
}

async function deleteProduct(id) {
  if (confirm("Remover este produto?")) {
    logAuditAction('EXCLUIR_PRODUTO', `Removeu o produto ID #${id}`);
    products = products.filter(p => p.id !== id);
    await saveUserData();
    updateSelectOptions();
  }
}

// --- MÓDULO DE DESPESAS OPERACIONAIS E LUCRO LÍQUIDO ---
document.getElementById('expenseForm').addEventListener('submit', async function(e) {
  e.preventDefault();
  const expense = {
    id: Date.now(),
    description: document.getElementById('expenseDescription').value.trim(),
    amount: parseFloat(document.getElementById('expenseAmount').value) || 0,
    date: document.getElementById('expenseDate').value,
    sellerEmail: currentUser ? currentUser.email : ''
  };

  expenses.push(expense);
  logAuditAction('CRIAR_DESPESA', `Cadastrou despesa: ${expense.description}`);
  await saveUserData();
  this.reset();
  initExpenseDate();
});

function initExpenseDate() {
  const dateInput = document.getElementById('expenseDate');
  if (dateInput && !dateInput.value) {
    dateInput.value = new Date().toISOString().slice(0, 10);
  }
}

function initShipmentDate() {
  const shipInput = document.getElementById('orderShipmentDate');
  if (shipInput && !shipInput.value) {
    const d = new Date();
    d.setDate(d.getDate() + 15);
    shipInput.value = d.toISOString().slice(0, 10);
  }
}

function renderExpenses() {
  const tbody = document.getElementById('expensesTableBody');
  const search = (document.getElementById('searchExpenseInput')?.value || '').toLowerCase();
  
  const filtered = expenses.filter(ex => ex.description.toLowerCase().includes(search));

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="4">Nenhuma despesa operacional cadastrada.</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(ex => `
    <tr>
      <td>${formatDatePtBr(ex.date)}</td>
      <td><strong>${ex.description}</strong></td>
      <td style="color: #ef4444; font-weight: bold;">${formatCurrency(ex.amount)}</td>
      <td>
        <button class="btn-danger" onclick="deleteExpense(${ex.id})">Excluir</button>
      </td>
    </tr>
  `).join('');
}

async function deleteExpense(id) {
  if (confirm("Remover esta despesa?")) {
    expenses = expenses.filter(ex => ex.id !== id);
    await saveUserData();
  }
}

function exportExpensesCSV() {
  if (expenses.length === 0) {
    alert("Nenhuma despesa para exportar.");
    return;
  }
  let csvContent = "\uFEFFData;Descricao;Valor (R$)\n";
  expenses.forEach(ex => {
    const formattedVal = (ex.amount || 0).toFixed(2).replace('.', ',');
    csvContent += `${formatDatePtBr(ex.date)};${ex.description};${formattedVal}\n`;
  });

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `despesas_operacionais_${new Date().toISOString().slice(0,10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// --- ATUALIZAÇÃO DE DROPDOWNS E BUSCA ---
function updateSelectOptions() {
  const orderSupp = document.getElementById('orderSupplier');
  const filterSupp = document.getElementById('filterSupplier');
  const reportSupp = document.getElementById('reportSupplier');
  const globalSel = document.getElementById('globalCompanySelect');

  const suppOptions = suppliers.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
  if (orderSupp && orderSupp.tagName === 'SELECT') {
    orderSupp.innerHTML = '<option value="">Selecione o Fornecedor...</option>' + suppOptions;
  }
  if (filterSupp) filterSupp.innerHTML = '<option value="ALL">Todos os Fornecedores</option>' + suppOptions;
  if (reportSupp) reportSupp.innerHTML = '<option value="ALL">Todas as Representadas</option>' + suppOptions;
  
  if (globalSel) {
    globalSel.innerHTML = '<option value="ALL">Todas as Representadas</option>' + suppOptions;
    globalSel.value = activeGlobalCompany;
  }

  const reportSellerSel = document.getElementById('reportSeller');
  if (reportSellerSel) {
    const sellerOpts = allSellersData.map(s => `<option value="${s.email}">${s.name} (${s.email})</option>`).join('');
    reportSellerSel.innerHTML = '<option value="ALL">Todos os Vendedores</option>' + sellerOpts;
  }
}

function renderSupplierDropdown(filterText = '') {
  const menu = document.getElementById('orderSupplierDropdown');
  if (!menu) return;

  const query = (filterText || '').trim().toLowerCase();
  const filtered = suppliers.filter(s => 
    (s.name && s.name.toLowerCase().includes(query)) || 
    (s.code && s.code.toLowerCase().includes(query))
  );

  if (filtered.length === 0) {
    menu.innerHTML = `<div class="custom-dropdown-empty">Nenhum fornecedor encontrado</div>`;
  } else {
    menu.innerHTML = filtered.map(s => `
      <div class="custom-dropdown-item" onclick="selectSupplierItem('${s.id}', '${escapeDropdownStr(s.name)}')">
        <div class="item-title">${s.name}</div>
        ${s.code ? `<div class="item-meta"><span class="badge-meta">Cód: ${s.code}</span></div>` : ''}
      </div>
    `).join('');
  }
  menu.classList.remove('hidden');
}

function onSupplierSearchInput(val) {
  document.getElementById('orderSupplier').value = '';
  renderSupplierDropdown(val);
}

function selectSupplierItem(id, name) {
  document.getElementById('orderSupplier').value = id;
  document.getElementById('orderSupplierSearch').value = name;
  const menu = document.getElementById('orderSupplierDropdown');
  if (menu) menu.classList.add('hidden');
}

function renderClientDropdown(filterText = '') {
  const menu = document.getElementById('orderClientDropdown');
  if (!menu) return;

  const query = (filterText || '').trim().toLowerCase();
  const filtered = clients.filter(c => 
    (c.name && c.name.toLowerCase().includes(query)) || 
    (c.cnpj && c.cnpj.toLowerCase().includes(query))
  );

  if (filtered.length === 0) {
    menu.innerHTML = `<div class="custom-dropdown-empty">Nenhum cliente encontrado</div>`;
  } else {
    menu.innerHTML = filtered.map(c => `
      <div class="custom-dropdown-item" onclick="selectClientItem('${c.id}', '${escapeDropdownStr(c.name)}', '${escapeDropdownStr(c.cnpj || '')}')">
        <div class="item-title">${c.name}</div>
        <div class="item-meta">
          <span>${c.cnpj ? `CNPJ/CPF: ${c.cnpj}` : 'Sem Documento'}</span>
          ${c.city ? `<span>• ${c.city}${c.state ? '/' + c.state : ''}</span>` : ''}
        </div>
      </div>
    `).join('');
  }
  menu.classList.remove('hidden');
}

function onClientSearchInput(val) {
  document.getElementById('orderClient').value = '';
  renderClientDropdown(val);
}

function selectClientItem(id, name, cnpj) {
  document.getElementById('orderClient').value = id;
  const displayVal = cnpj ? `${name} - ${cnpj}` : name;
  document.getElementById('orderClientSearch').value = displayVal;
  const menu = document.getElementById('orderClientDropdown');
  if (menu) menu.classList.add('hidden');
}

function renderProductDropdown(filterText = '') {
  const menu = document.getElementById('orderProductDropdown');
  if (!menu) return;

  const query = (filterText || '').trim().toLowerCase();
  const filtered = products.filter(p => 
    (p.name && p.name.toLowerCase().includes(query)) || 
    (p.code && p.code.toLowerCase().includes(query))
  );

  if (filtered.length === 0) {
    menu.innerHTML = `<div class="custom-dropdown-empty">Nenhum produto encontrado</div>`;
  } else {
    menu.innerHTML = filtered.map(p => `
      <div class="custom-dropdown-item" onclick="selectProductItem('${p.id}', '${escapeDropdownStr(p.name)}', ${p.price || 0}, ${p.stock !== undefined ? p.stock : 0}, ${p.ipiRate || 0}, ${p.stRate || 0})">
        <div class="item-title">${p.name}</div>
        <div class="item-meta">
          <span class="badge-meta">Preço: ${formatCurrency(p.price || 0)}</span>
          <span>Estoque: ${p.stock !== undefined ? p.stock : 0} un</span>
          ${p.code ? `<span>• Cód: ${p.code}</span>` : ''}
        </div>
      </div>
    `).join('');
  }
  menu.classList.remove('hidden');
}

function onProductSearchInput(val) {
  document.getElementById('orderProduct').value = '';
  const priceInput = document.getElementById('orderItemPrice');
  if (priceInput) priceInput.value = '';
  renderProductDropdown(val);
}

function selectProductItem(id, name, price, stock, ipiRate, stRate) {
  document.getElementById('orderProduct').value = id;
  document.getElementById('orderProductSearch').value = `${name} - ${formatCurrency(price)}`;
  const priceInput = document.getElementById('orderItemPrice');
  if (priceInput) priceInput.value = Number(price).toFixed(2);
  if (document.getElementById('orderItemIpiRate')) {
    document.getElementById('orderItemIpiRate').value = ipiRate || 0;
  }
  if (document.getElementById('orderItemStRate')) {
    document.getElementById('orderItemStRate').value = stRate || 0;
  }
  const menu = document.getElementById('orderProductDropdown');
  if (menu) menu.classList.add('hidden');
}

function escapeDropdownStr(str) {
  if (!str) return '';
  return str.replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

document.addEventListener('click', function(e) {
  if (!e.target.closest('.custom-dropdown-container')) {
    document.querySelectorAll('.custom-dropdown-menu').forEach(m => m.classList.add('hidden'));
  }
});

function onPaymentTermsChange() {
  const termsSelect = document.getElementById('orderPaymentTerms').value;
  const installmentsInput = document.getElementById('orderInstallments');
  const intervalInput = document.getElementById('orderIntervalDays');

  let firstDueDateOffset = 30;

  switch (termsSelect) {
    case 'AVISTA':
      installmentsInput.value = 1;
      intervalInput.value = 0;
      firstDueDateOffset = 0;
      break;
    case 'BOLETO_7_DIAS':
      installmentsInput.value = 1;
      intervalInput.value = 7;
      firstDueDateOffset = 7;
      break;
    case 'BOLETO_14_DIAS':
      installmentsInput.value = 1;
      intervalInput.value = 14;
      firstDueDateOffset = 14;
      break;
    case 'BOLETO_15_DIAS':
      installmentsInput.value = 1;
      intervalInput.value = 15;
      firstDueDateOffset = 15;
      break;
    case 'BOLETO_30':
      installmentsInput.value = 1;
      intervalInput.value = 30;
      firstDueDateOffset = 30;
      break;
    case 'BOLETO_30_60':
      installmentsInput.value = 2;
      intervalInput.value = 30;
      firstDueDateOffset = 30;
      break;
    case 'BOLETO_30_60_90':
      installmentsInput.value = 3;
      intervalInput.value = 30;
      firstDueDateOffset = 30;
      break;
    case 'CARTAO':
    case 'OUTRO':
    default:
      firstDueDateOffset = parseInt(intervalInput.value) || 30;
      break;
  }

  updateFirstDueDate(firstDueDateOffset);
  recalculateOrderTotals();
}

function onIntervalDaysInput() {
  const days = parseInt(document.getElementById('orderIntervalDays').value) || 0;
  updateFirstDueDate(days);
  recalculateOrderTotals();
}

function updateFirstDueDate(daysOffset) {
  const dateInput = document.getElementById('orderFirstDueDate');
  if (!dateInput) return;
  const d = new Date();
  d.setDate(d.getDate() + parseInt(daysOffset || 0));
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  dateInput.value = `${year}-${month}-${day}`;
}

function getPaymentTermsLabel(val, count = 1) {
  switch (val) {
    case 'AVISTA': return 'À Vista / PIX (Hoje)';
    case 'BOLETO_7_DIAS': return 'Boleto 7 dias (1x)';
    case 'BOLETO_14_DIAS': return 'Boleto 14 dias (1x)';
    case 'BOLETO_15_DIAS': return 'Boleto 15 dias (1x)';
    case 'BOLETO_30': return 'Boleto 30 dias (1x)';
    case 'BOLETO_30_60': return 'Boleto 30/60 dias (2x)';
    case 'BOLETO_30_60_90': return 'Boleto 30/60/90 dias (3x)';
    case 'CARTAO': return `Cartão de Crédito (${count}x)`;
    case 'OUTRO': return `Personalizado (${count}x)`;
    default: return val || 'Boleto';
  }
}

function saveCartItem() {
  const prodId = document.getElementById('orderProduct').value;
  const qty = parseInt(document.getElementById('orderQty').value) || 1;
  const customPrice = parseFloat(document.getElementById('orderItemPrice').value);
  const discountPercent = parseFloat(document.getElementById('orderItemDiscount')?.value) || 0;
  const ipiRate = parseFloat(document.getElementById('orderItemIpiRate').value) || 0;
  const stRate = parseFloat(document.getElementById('orderItemStRate').value) || 0;
  const editingIndex = parseInt(document.getElementById('editingItemIndex').value);

  if (!prodId) {
    alert("Selecione um produto válido da lista.");
    return;
  }

  const prod = products.find(p => p.id.toString() === prodId.toString());
  if (!prod) return;

  let unitPrice = isNaN(customPrice) ? prod.price : customPrice;
  if (discountPercent > 0) {
    unitPrice = unitPrice * (1 - (discountPercent / 100));
  }

  const baseSubtotal = unitPrice * qty;
  const itemIpiVal = baseSubtotal * (ipiRate / 100);
  const itemStVal = baseSubtotal * (stRate / 100);
  const totalWithTaxes = baseSubtotal + itemIpiVal + itemStVal;

  const itemData = {
    id: prod.id,
    name: prod.name,
    ncm: prod.ncm,
    price: unitPrice,
    originalPrice: isNaN(customPrice) ? prod.price : customPrice,
    discountPercent: discountPercent,
    qty: qty,
    ipiRate: ipiRate,
    stRate: stRate,
    ipiVal: itemIpiVal,
    stVal: itemStVal,
    subtotal: totalWithTaxes,
    baseSubtotal: baseSubtotal
  };

  if (editingIndex > -1) {
    cart[editingIndex] = itemData;
    cancelEditCartItem();
  } else {
    cart.push(itemData);
  }

  renderCart();
  recalculateOrderTotals();
  resetItemForm();
}

function resetItemForm() {
  document.getElementById('orderProductSearch').value = '';
  document.getElementById('orderProduct').value = '';
  document.getElementById('orderItemPrice').value = '';
  document.getElementById('orderQty').value = '1';
  if (document.getElementById('orderItemDiscount')) document.getElementById('orderItemDiscount').value = '0';
  document.getElementById('orderItemIpiRate').value = '0';
  document.getElementById('orderItemStRate').value = '0';
}

function renderCart() {
  const tbody = document.getElementById('cartTableBody');
  if (cart.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="7">Nenhum item adicionado ao pedido.</td></tr>';
    return;
  }

  tbody.innerHTML = cart.map((item, index) => `
    <tr>
      <td><strong>${item.name}</strong></td>
      <td>${item.ncm || '-'}</td>
      <td>${formatCurrency(item.price)} ${item.discountPercent > 0 ? `<br><small style="color:#16a34a">Desc: ${item.discountPercent}%</small>` : ''}</td>
      <td>${item.qty}</td>
      <td>IPI: ${item.ipiRate}% (${formatCurrency(item.ipiVal)})<br>ST: ${item.stRate}% (${formatCurrency(item.stVal)})</td>
      <td><strong>${formatCurrency(item.subtotal)}</strong></td>
      <td>
        <div style="display: flex; gap: 6px;">
          <button type="button" class="btn-secondary" onclick="editCartItem(${index})">✏️ Editar</button>
          <button type="button" class="btn-danger" onclick="removeCartItem(${index})">X</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function editCartItem(index) {
  const item = cart[index];
  if (!item) return;

  document.getElementById('editingItemIndex').value = index;
  document.getElementById('orderProduct').value = item.id;
  document.getElementById('orderProductSearch').value = `${item.name} - ${formatCurrency(item.originalPrice || item.price)}`;
  document.getElementById('orderItemPrice').value = (item.originalPrice || item.price).toFixed(2);
  document.getElementById('orderQty').value = item.qty;
  if (document.getElementById('orderItemDiscount')) document.getElementById('orderItemDiscount').value = item.discountPercent || 0;
  document.getElementById('orderItemIpiRate').value = item.ipiRate || 0;
  document.getElementById('orderItemStRate').value = item.stRate || 0;

  document.getElementById('cartLegendTitle').innerText = `Editando Item #${index + 1} do Pedido`;
  document.getElementById('addItemBtn').innerText = "Salvar Alteração do Item";
  document.getElementById('cancelEditItemBtn').classList.remove('hidden');
}

function cancelEditCartItem() {
  document.getElementById('editingItemIndex').value = '-1';
  document.getElementById('cartLegendTitle').innerText = "Adicionar Produtos ao Pedido";
  document.getElementById('addItemBtn').innerText = "+ Adicionar Item";
  document.getElementById('cancelEditItemBtn').classList.add('hidden');
  resetItemForm();
}

function removeCartItem(index) {
  cart.splice(index, 1);
  renderCart();
  recalculateOrderTotals();
}

function recalculateOrderTotals() {
  const itemsSubtotal = cart.reduce((acc, item) => acc + (item.baseSubtotal || (item.price * item.qty)), 0);
  const freight = parseFloat(document.getElementById('orderFreight').value) || 0;
  const generalDiscount = parseFloat(document.getElementById('orderDiscountVal').value) || 0;
  
  const totalIpiVal = cart.reduce((acc, item) => acc + (item.ipiVal || 0), 0);
  const totalStVal = cart.reduce((acc, item) => acc + (item.stVal || 0), 0);

  const grandTotal = Math.max(0, itemsSubtotal - generalDiscount) + freight + totalIpiVal + totalStVal;

  const paymentTerms = document.getElementById('orderPaymentTerms').value;
  let numInstallments = parseInt(document.getElementById('orderInstallments').value) || 1;

  if (paymentTerms === 'AVISTA') {
    numInstallments = 1;
    document.getElementById('orderInstallments').value = 1;
  }

  const commRate = parseFloat(document.getElementById('orderCommissionRate').value) || 0;
  // Melhoria: Base de comissão calculada estritamente sobre os produtos (itensSubtotal)
  const totalCommission = itemsSubtotal * (commRate / 100);

  document.getElementById('orderIpiVal').value = totalIpiVal;
  document.getElementById('orderStVal').value = totalStVal;
  document.getElementById('cartSubtotal').innerText = formatCurrency(itemsSubtotal);
  document.getElementById('cartTotal').innerText = formatCurrency(grandTotal);
  document.getElementById('cartCommission').innerText = formatCurrency(totalCommission);

  const instVal = grandTotal / (numInstallments || 1);
  document.getElementById('installmentBreakdown').innerText = `(${numInstallments}x de ${formatCurrency(instVal)})`;
}

function buildOrderDataObject(statusEnvio) {
  const editingId = document.getElementById('editingOrderId').value;
  const suppId = document.getElementById('orderSupplier').value;
  const clientId = document.getElementById('orderClient').value;
  const notes = (document.getElementById('orderNotes')?.value || '').trim();
  const shipmentDate = document.getElementById('orderShipmentDate')?.value || '';
  const freightType = document.getElementById('orderFreightType')?.value || 'CIF';

  if (!suppId) {
    alert("Selecione o fornecedor.");
    return null;
  }
  if (!clientId) {
    alert("Selecione um cliente válido da lista.");
    return null;
  }
  if (cart.length === 0) {
    alert("Adicione pelo menos um produto ao carrinho.");
    return null;
  }

  const clientIds = [clientId];
  const itemsSubtotal = cart.reduce((acc, item) => acc + (item.baseSubtotal || (item.price * item.qty)), 0);
  const freight = parseFloat(document.getElementById('orderFreight').value) || 0;
  const generalDiscount = parseFloat(document.getElementById('orderDiscountVal').value) || 0;
  const totalIpiVal = cart.reduce((acc, item) => acc + (item.ipiVal || 0), 0);
  const totalStVal = cart.reduce((acc, item) => acc + (item.stVal || 0), 0);
  const grandTotal = Math.max(0, itemsSubtotal - generalDiscount) + freight + totalIpiVal + totalStVal;

  const paymentTerms = document.getElementById('orderPaymentTerms').value;
  const numInstallments = parseInt(document.getElementById('orderInstallments').value) || 1;
  const intervalDays = parseInt(document.getElementById('orderIntervalDays').value) || 30;
  const commRate = parseFloat(document.getElementById('orderCommissionRate').value) || 0;
  const totalCommission = itemsSubtotal * (commRate / 100);
  const firstDueDateStr = document.getElementById('orderFirstDueDate').value;

  if (!firstDueDateStr) {
    alert("Informe a data do 1º vencimento.");
    return null;
  }

  const orderId = editingId ? parseInt(editingId) : Date.now();
  
  const orderData = {
    id: orderId,
    supplierId: suppId,
    clientIds: clientIds,
    items: JSON.parse(JSON.stringify(cart)),
    subtotal: itemsSubtotal,
    freight, 
    freightType,
    generalDiscount,
    ipiVal: totalIpiVal, 
    stVal: totalStVal,
    total: grandTotal,
    paymentTerms: paymentTerms,
    installmentsCount: numInstallments,
    intervalDays: intervalDays,
    commissionRate: commRate,
    commissionTotal: totalCommission,
    notes: notes,
    shipmentDate: shipmentDate,
    date: new Date().toLocaleDateString('pt-BR'),
    createdAt: new Date().toISOString(),
    envioStatus: statusEnvio,
    sellerEmail: currentUser ? currentUser.email : ''
  };

  const newInsts = [];
  const installmentAmount = grandTotal / numInstallments;
  const installmentComm = totalCommission / numInstallments;

  let [year, month, day] = firstDueDateStr.split('-').map(Number);
  let baseDate = new Date(year, month - 1, day);

  for (let i = 1; i <= numInstallments; i++) {
    let currentDueDate = new Date(baseDate);
    if (i > 1) {
      currentDueDate.setDate(currentDueDate.getDate() + (intervalDays * (i - 1)));
    }

    newInsts.push({
      id: orderId + i,
      orderId: orderId,
      supplierId: suppId,
      clientIds: clientIds,
      number: `${i}/${numInstallments}`,
      paymentTerms: paymentTerms,
      dueDate: currentDueDate.toLocaleDateString('pt-BR'),
      dueDateIso: currentDueDate.toISOString().slice(0, 10),
      amount: installmentAmount,
      commission: installmentComm,
      status: 'PENDING',
      sellerEmail: currentUser ? currentUser.email : ''
    });
  }

  return { orderData, newInsts };
}

async function submitOrderOnly() {
  const res = buildOrderDataObject('Rascunho');
  if (!res) return;

  const { orderData, newInsts } = res;
  logAuditAction('SALVAR_PEDIDO', `Salvou rascunho do pedido #${orderData.id.toString().slice(-6)}`);
  await persistOrderTransaction(orderData, newInsts);
  alert("Pedido salvo com sucesso como rascunho!");
}

async function submitAndSendOrder() {
  const res = buildOrderDataObject('Enviado');
  if (!res) return;

  const { orderData, newInsts } = res;
  logAuditAction('ENVIAR_PEDIDO', `Emitiu e enviou o pedido #${orderData.id.toString().slice(-6)}`);
  await persistOrderTransaction(orderData, newInsts);

  lastGeneratedOrderId = orderData.id;
  document.getElementById('sendOptionsModal').classList.remove('hidden');
}

async function persistOrderTransaction(orderData, newInsts) {
  const editingId = document.getElementById('editingOrderId').value;

  if (editingId) {
    const oldOrder = orders.find(o => o.id.toString() === editingId.toString());
    if (oldOrder && oldOrder.items) {
      oldOrder.items.forEach(oldItem => {
        const prod = products.find(p => p.id.toString() === oldItem.id.toString());
        if (prod) prod.stock = (prod.stock || 0) + oldItem.qty;
      });
    }
    orders = orders.filter(o => o.id.toString() !== editingId.toString());
    installments = installments.filter(i => i.orderId.toString() !== editingId.toString());
  }

  orderData.items.forEach(item => {
    const prod = products.find(p => p.id.toString() === item.id.toString());
    if (prod) {
      prod.stock = (prod.stock || 0) - item.qty;
    }
  });

  orders.push(orderData);
  installments.push(...newInsts);

  await saveUserData();
  resetOrderFormState();
  renderAllViews();
}

function closeSendModal() {
  document.getElementById('sendOptionsModal').classList.add('hidden');
}

function resetOrderFormState() {
  cart = [];
  cancelEditCartItem();
  renderCart();
  document.getElementById('orderForm').reset();
  document.getElementById('editingOrderId').value = '';
  document.getElementById('orderNotes').value = '';
  document.getElementById('orderFormTitle').innerText = "Emissão de Pedido de Venda";
  document.getElementById('btnCancelEdit').classList.add('hidden');
  
  if (document.getElementById('orderSupplierSearch')) document.getElementById('orderSupplierSearch').value = '';
  if (document.getElementById('orderClientSearch')) document.getElementById('orderClientSearch').value = '';

  document.querySelectorAll('.custom-dropdown-menu').forEach(m => m.classList.add('hidden'));

  updateFirstDueDate(30);
  initShipmentDate();
  recalculateOrderTotals();
}

function cancelEditOrder() {
  resetOrderFormState();
  alert("Edição cancelada.");
}

function editOrder(orderId) {
  const order = orders.find(o => o.id === orderId);
  if (!order) return;

  document.getElementById('editingOrderId').value = order.id;
  document.getElementById('orderFormTitle').innerText = `Editando Pedido #${order.id.toString().slice(-6)}`;
  document.getElementById('btnCancelEdit').classList.remove('hidden');

  document.getElementById('orderSupplier').value = order.supplierId;
  const supp = suppliers.find(s => s.id.toString() === order.supplierId.toString());
  if (document.getElementById('orderSupplierSearch')) {
    document.getElementById('orderSupplierSearch').value = supp ? supp.name : '';
  }
  
  if (order.clientIds && order.clientIds.length > 0) {
    const cliId = order.clientIds[0];
    document.getElementById('orderClient').value = cliId;
    const c = clients.find(cl => cl.id.toString() === cliId.toString());
    if (c) {
      document.getElementById('orderClientSearch').value = `${c.name} - ${c.cnpj || ''}`;
    }
  }

  cart = JSON.parse(JSON.stringify(order.items || []));
  renderCart();

  document.getElementById('orderFreight').value = order.freight || 0;
  if (document.getElementById('orderFreightType')) document.getElementById('orderFreightType').value = order.freightType || 'CIF';
  if (document.getElementById('orderDiscountVal')) document.getElementById('orderDiscountVal').value = order.generalDiscount || 0;
  document.getElementById('orderPaymentTerms').value = order.paymentTerms || 'BOLETO_30_60_90';
  document.getElementById('orderInstallments').value = order.installmentsCount || 1;
  document.getElementById('orderIntervalDays').value = order.intervalDays || 30;
  document.getElementById('orderCommissionRate').value = order.commissionRate || 5.0;
  document.getElementById('orderNotes').value = order.notes || '';
  if (order.shipmentDate && document.getElementById('orderShipmentDate')) {
    document.getElementById('orderShipmentDate').value = order.shipmentDate;
  }

  recalculateOrderTotals();
  switchTab('pedidos', null);
}

// --- DUPLICAR PEDIDO (NOVA MELHORIA) ---
function duplicateOrder(orderId) {
  const order = orders.find(o => o.id === orderId);
  if (!order) return;

  document.getElementById('editingOrderId').value = ''; // Limpa para gerar um novo ID
  document.getElementById('orderFormTitle').innerText = `Duplicando Pedido #${order.id.toString().slice(-6)}`;
  document.getElementById('btnCancelEdit').classList.remove('hidden');

  document.getElementById('orderSupplier').value = order.supplierId;
  const supp = suppliers.find(s => s.id.toString() === order.supplierId.toString());
  if (document.getElementById('orderSupplierSearch')) {
    document.getElementById('orderSupplierSearch').value = supp ? supp.name : '';
  }
  
  if (order.clientIds && order.clientIds.length > 0) {
    const cliId = order.clientIds[0];
    document.getElementById('orderClient').value = cliId;
    const c = clients.find(cl => cl.id.toString() === cliId.toString());
    if (c) {
      document.getElementById('orderClientSearch').value = `${c.name} - ${c.cnpj || ''}`;
    }
  }

  cart = JSON.parse(JSON.stringify(order.items || []));
  renderCart();

  document.getElementById('orderFreight').value = order.freight || 0;
  if (document.getElementById('orderFreightType')) document.getElementById('orderFreightType').value = order.freightType || 'CIF';
  if (document.getElementById('orderDiscountVal')) document.getElementById('orderDiscountVal').value = order.generalDiscount || 0;
  document.getElementById('orderPaymentTerms').value = order.paymentTerms || 'BOLETO_30_60_90';
  document.getElementById('orderInstallments').value = order.installmentsCount || 1;
  document.getElementById('orderIntervalDays').value = order.intervalDays || 30;
  document.getElementById('orderCommissionRate').value = order.commissionRate || 5.0;
  document.getElementById('orderNotes').value = order.notes || '';

  recalculateOrderTotals();
  switchTab('pedidos', null);
  alert("Pedido duplicado com sucesso! Revise os dados e clique em salvar.");
}

function printOrderPdf() {
  closeSendModal();
  if (!lastGeneratedOrderId) return;
  printOrderMirror(lastGeneratedOrderId);
}

// --- NOTIFICAÇÕES AUTOMATIZADAS VIA WHATSAPP (BOTÃO DIRETO) ---
function sendOrderWhatsApp() {
  closeSendModal();
  const order = orders.find(o => o.id === lastGeneratedOrderId);
  if (!order) return;

  const supp = suppliers.find(s => s.id.toString() === order.supplierId.toString());
  const client = clients.find(c => order.clientIds && order.clientIds.includes(c.id.toString()));
  
  const targetPhone = (supp && supp.whatsapp) ? supp.whatsapp : (supp && supp.contact ? supp.contact : '');
  const phone = targetPhone.replace(/\D/g, '');
  
  const condLabel = getPaymentTermsLabel(order.paymentTerms, order.installmentsCount);

  let msg = `*PEDIDO DE VENDA #${order.id.toString().slice(-6)}*\n`;
  msg += `*Representada:* ${supp ? supp.name : '-'}\n`;
  msg += `*Cliente:* ${client ? client.name : '-'}\n`;
  msg += `*Condição Pagamento:* ${condLabel} (${order.installmentsCount}x)\n`;
  if (order.notes) msg += `*Observações:* ${order.notes}\n`;
  msg += `\n*Itens do Pedido:*\n`;
  order.items.forEach(i => {
    msg += `- ${i.qty}x ${i.name} (IPI: ${i.ipiRate}%, ST: ${i.stRate}%) -> ${formatCurrency(i.subtotal)}\n`;
  });
  msg += `\n*Subtotal:* ${formatCurrency(order.subtotal)}`;
  if (order.generalDiscount > 0) msg += `\n*Desconto:* ${formatCurrency(order.generalDiscount)}`;
  if (order.freight > 0) msg += `\n*Frete:* ${formatCurrency(order.freight)}`;
  msg += `\n*TOTAL GERAL:* ${formatCurrency(order.total)}`;

  const encoded = encodeURIComponent(msg);
  const url = phone ? `https://api.whatsapp.com/send?phone=55${phone}&text=${encoded}` : `https://api.whatsapp.com/send?text=${encoded}`;
  window.open(url, '_blank');
}

// --- NOTIFICAÇÕES AUTOMATIZADAS VIA E-MAIL (BOTÃO DIRETO) ---
function sendOrderEmail() {
  closeSendModal();
  const order = orders.find(o => o.id === lastGeneratedOrderId);
  if (!order) return;

  const supp = suppliers.find(s => s.id.toString() === order.supplierId.toString());
  const client = clients.find(c => order.clientIds && order.clientIds.includes(c.id.toString()));
  const subject = encodeURIComponent(`Pedido de Venda #${order.id.toString().slice(-6)} - ${supp ? supp.name : ''}`);
  const condLabel = getPaymentTermsLabel(order.paymentTerms, order.installmentsCount);

  let body = `Prezados,\n\nSegue o resumo oficial do pedido #${order.id.toString().slice(-6)}:\n\n`;
  body += `Representada: ${supp ? supp.name : '-'}\n`;
  body += `Cliente: ${client ? client.name : '-'}\n\nItens:\n`;
  order.items.forEach(i => {
    body += `- ${i.qty}x ${i.name} = ${formatCurrency(i.subtotal)}\n`;
  });
  body += `\nTOTAL GERAL: ${formatCurrency(order.total)}`;
  body += `\nCondição: ${condLabel} (${order.installmentsCount}x)\n`;
  if (order.notes) body += `Observações: ${order.notes}\n`;
  body += `\nAtenciosamente,\n${currentUser.name}`;

  window.location.href = `mailto:?subject=${subject}&body=${encodeURIComponent(body)}`;
}

// --- COBRANÇA DE PARCELAS VIA WHATSAPP ---
function sendInstallmentWhatsApp(instId) {
  const inst = installments.find(i => i.id === instId);
  if (!inst) return;

  const client = clients.find(c => inst.clientIds && inst.clientIds.includes(c.id.toString()));
  const targetPhone = (client && client.whatsapp) ? client.whatsapp : (client && client.phone ? client.phone : '');
  const phoneDigits = targetPhone.replace(/\D/g, '');

  let msg = `Olá ${client ? client.name : 'Cliente'}, informamos que a parcela *${inst.number}* referente ao pedido #${inst.orderId.toString().slice(-6)} no valor de *${formatCurrency(inst.amount)}* possui vencimento em *${inst.dueDate}*. Aguardamos confirmação de pagamento.`;
  const url = phoneDigits ? `https://api.whatsapp.com/send?phone=55${phoneDigits}&text=${encodeURIComponent(msg)}` : `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
  window.open(url, '_blank');
}

function renderOrdersHistory() {
  const tbody = document.getElementById('ordersHistoryBody');
  const filtered = orders.filter(o => {
    const matchGlobal = activeGlobalCompany === 'ALL' || o.supplierId.toString() === activeGlobalCompany.toString();
    const matchSeller = !isMasterView || activeSellerFilter === 'ALL' || o.sellerEmail === activeSellerFilter;
    return matchGlobal && matchSeller;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="8">Nenhum pedido emitido para a representada selecionada.</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(o => {
    const supp = suppliers.find(s => s.id.toString() === o.supplierId.toString());
    const clientNames = (o.clientIds || []).map(cid => {
      const c = clients.find(cl => cl.id.toString() === cid.toString());
      return c ? c.name : 'Cliente Excluído';
    }).join(', ');

    const orderInsts = installments.filter(i => i.orderId === o.id);
    const paidInsts = orderInsts.filter(i => i.status === 'PAID');
    
    let statusRepasse = `<span class="badge badge-amber">Pendente (${paidInsts.length}/${orderInsts.length})</span>`;
    if (paidInsts.length === orderInsts.length && orderInsts.length > 0) {
      statusRepasse = `<span class="badge badge-green">Quitado</span>`;
    }

    const envioStatus = o.envioStatus === 'Enviado' 
      ? `<span class="badge badge-green">Enviado</span>` 
      : `<span class="badge badge-amber">Rascunho</span>`;

    const condText = getPaymentTermsLabel(o.paymentTerms, o.installmentsCount);

    return `
      <tr>
        <td><strong>#${o.id.toString().slice(-6)}</strong></td>
        <td>${supp ? supp.name : 'Indefinido'}</td>
        <td>${clientNames}</td>
        <td>${condText}</td>
        <td><strong>${formatCurrency(o.total)}</strong></td>
        <td>${envioStatus}</td>
        <td>${statusRepasse}</td>
        <td>
          <div style="display: flex; gap: 6px;">
            <button class="btn-secondary" onclick="editOrder(${o.id})">✏️ Editar</button>
            <button class="btn-secondary" onclick="duplicateOrder(${o.id})">📋 Duplicar</button>
            <button class="btn-secondary" onclick="printOrderMirror(${o.id})">🖨️ PDF</button>
            <button class="btn-danger" onclick="deleteOrder(${o.id})">Excluir</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

async function deleteOrder(orderId) {
  if (confirm("Tem certeza que deseja cancelar/excluir este pedido? (O estoque dos produtos será estornado ao catálogo)")) {
    const order = orders.find(o => o.id === orderId);
    if (order && order.items) {
      order.items.forEach(item => {
        const prod = products.find(p => p.id.toString() === item.id.toString());
        if (prod) {
          prod.stock = (prod.stock || 0) + item.qty;
        }
      });
    }

    logAuditAction('EXCLUIR_PEDIDO', `Excluiu o pedido #${orderId.toString().slice(-6)}`);
    orders = orders.filter(o => o.id !== orderId);
    installments = installments.filter(i => i.orderId !== orderId);
    await saveUserData();
    renderAllViews();
    alert("Pedido excluído e estoque estornado com sucesso!");
  }
}

function printOrderMirror(orderId) {
  const order = orders.find(o => o.id === orderId);
  if (!order) return;

  const supp = suppliers.find(s => s.id.toString() === order.supplierId.toString());
  const client = clients.find(c => order.clientIds && order.clientIds.includes(c.id.toString()));
  const condLabel = getPaymentTermsLabel(order.paymentTerms, order.installmentsCount);

  const freightType = order.freightType || 'CIF';
  const checkCif = freightType === 'CIF' ? '☒' : '☐';
  const checkFob = freightType === 'FOB' ? '☒' : '☐';
  const checkRetira = freightType === 'RETIRA' ? '☒' : '☐';

  const printWindow = window.open('', '', 'width=900,height=700');
  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Espelho do Pedido #${order.id.toString().slice(-6)}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 15px; line-height: 1.3; color: #000; font-size: 11px; }
          .header-print { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 10px; }
          .header-print img { max-height: 55px; max-width: 160px; object-fit: contain; }
          .title-area { text-align: center; flex: 1; }
          h1 { margin: 0; font-size: 16px; font-weight: bold; }
          .section-box { border: 1px solid #000; padding: 8px; margin-bottom: 8px; border-radius: 4px; }
          .row { display: flex; gap: 10px; margin-bottom: 4px; }
          .col { flex: 1; }
          table { width: 100%; border-collapse: collapse; margin-top: 5px; margin-bottom: 10px; }
          th, td { border: 1px solid #000; padding: 5px; text-align: left; font-size: 10.5px; }
          th { background: #e2e8f0; font-weight: bold; }
          .summary { margin-top: 10px; text-align: right; }
          .summary p { margin: 3px 0; font-size: 11px; }
          .signatures { display: flex; justify-content: space-between; margin-top: 40px; text-align: center; }
          .sig-line { width: 40%; border-top: 1px solid #000; padding-top: 5px; font-weight: bold; }
          .notes-box { margin-top: 8px; padding: 6px; border: 1px dashed #000; font-size: 10.5px; }
        </style>
      </head>
      <body>
        <div class="header-print">
          <div>
            ${representativeLogoUrl ? `<img src="${representativeLogoUrl}" alt="Logo Empresa">` : `<div style="font-weight:bold; font-size:12px;">DRP SOLUÇÕES</div>`}
          </div>
          <div class="title-area">
            <h1>PEDIDO DE VENDA #${order.id.toString().slice(-6)}</h1>
            <p style="margin: 2px 0 0 0;"><strong>Emissão:</strong> ${order.date}</p>
          </div>
          <div>
            ${supp && supp.logoUrl ? `<img src="${supp.logoUrl}" alt="Logo Fornecedor">` : ''}
          </div>
        </div>

        <div class="section-box">
          <p style="margin: 2px 0;"><strong>Representada / Fornecedor:</strong> ${supp ? supp.name + (supp.cnpj ? ' (CNPJ: ' + supp.cnpj + ')' : '') : '-'}</p>
          ${supp ? `<p style="margin: 2px 0;"><strong>Endereço:</strong> ${supp.address || ''}, nº ${supp.number || 'S/N'}, ${supp.neighborhood || ''} - ${supp.city || ''} | <strong>Tel:</strong> ${supp.contact || '-'} | <strong>WhatsApp:</strong> ${supp.whatsapp || '-'}</p>` : ''}
        </div>

        <div class="section-box">
          <p style="margin: 2px 0; font-weight: bold; background: #f1f5f9; padding: 2px;">DADOS DO CLIENTE</p>
          <div class="row" style="margin-top: 4px;">
            <div class="col"><strong>Razão Social:</strong> ${client ? client.name : '-'}</div>
            <div class="col"><strong>CNPJ/CPF:</strong> ${client && client.cnpj ? client.cnpj : '-'}</div>
          </div>
          <div class="row">
            <div class="col"><strong>Endereço:</strong> ${client && client.address ? client.address : '-'}, nº ${client && client.number ? client.number : 'S/N'}</div>
            <div class="col"><strong>Bairro:</strong> ${client && client.neighborhood ? client.neighborhood : '-'}</div>
          </div>
          <div class="row">
            <div class="col"><strong>Cidade/UF:</strong> ${client && client.city ? client.city : '-'}</div>
            <div class="col"><strong>CEP:</strong> ${client && client.cep ? client.cep : '-'}</div>
          </div>
          <div class="row">
            <div class="col"><strong>Telefone:</strong> ${client && client.phone ? client.phone : '-'} | <strong>WhatsApp:</strong> ${client && client.whatsapp ? client.whatsapp : '-'}</div>
            <div class="col"><strong>E-mail:</strong> ${client && client.email ? client.email : '-'}</div>
          </div>
        </div>

        <div class="section-box">
          <div class="row">
            <div class="col"><strong>Condição de Pagamento:</strong> ${condLabel}</div>
            <div class="col"><strong>Transporte / Frete:</strong> ${checkCif} CIF &nbsp;&nbsp; ${checkFob} FOB &nbsp;&nbsp; ${checkRetira} Retira</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width: 8%;">Item</th>
              <th style="width: 12%;">Código</th>
              <th style="width: 40%;">Descrição do Produto</th>
              <th style="width: 10%;">Qtd</th>
              <th style="width: 15%;">Preço Un.</th>
              <th style="width: 15%;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${order.items.map((i, index) => `
              <tr>
                <td>${String(index + 1).padStart(3, '0')}</td>
                <td>#${String(i.id).slice(-4)}</td>
                <td>${i.name} ${i.ncm ? '<br><small>NCM: ' + i.ncm + '</small>' : ''}</td>
                <td>${i.qty}</td>
                <td>${formatCurrency(i.price)}</td>
                <td><strong>${formatCurrency(i.subtotal)}</strong></td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        ${order.notes ? `<div class="notes-box"><strong>Observações:</strong> ${order.notes}</div>` : ''}

        <div class="summary">
          <p>Subtotal Produtos: <strong>${formatCurrency(order.subtotal)}</strong></p>
          ${order.generalDiscount > 0 ? `<p>Desconto Geral: <strong>${formatCurrency(order.generalDiscount)}</strong></p>` : ''}
          <p>Frete: <strong>${formatCurrency(order.freight || 0)}</strong></p>
          <p>Valor IPI: <strong>${formatCurrency(order.ipiVal || 0)}</strong> | Valor ST: <strong>${formatCurrency(order.stVal || 0)}</strong></p>
          <h2 style="font-size: 14px; margin-top: 5px;">TOTAL GERAL DO PEDIDO: ${formatCurrency(order.total)}</h2>
        </div>

        <div style="margin-top: 25px; font-weight: bold;">
          Data Prevista de Embarque: ${order.shipmentDate ? formatDatePtBr(order.shipmentDate) : 'A combinar'}
        </div>

        <div class="signatures">
          <div class="sig-line">Assinatura do Representante</div>
          <div class="sig-line">Assinatura do Comprador</div>
        </div>
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => { printWindow.print(); }, 500);
}

function renderFinancialTable() {
  const tbody = document.getElementById('financialTableBody');
  const filterSuppSelect = document.getElementById('filterSupplier').value;
  const filterStat = document.getElementById('filterStatus').value;

  const todayStr = new Date().toISOString().slice(0, 10);
  const fiveDaysFromNow = new Date();
  fiveDaysFromNow.setDate(fiveDaysFromNow.getDate() + 5);
  const fiveDaysStr = fiveDaysFromNow.toISOString().slice(0, 10);

  let filtered = installments.filter(i => {
    const matchGlobal = activeGlobalCompany === 'ALL' || i.supplierId.toString() === activeGlobalCompany.toString();
    const matchSupp = filterSuppSelect === 'ALL' || i.supplierId.toString() === filterSuppSelect.toString();
    const matchStat = filterStat === 'ALL' || i.status === filterStat;
    const matchSeller = !isMasterView || activeSellerFilter === 'ALL' || i.sellerEmail === activeSellerFilter;
    return matchGlobal && matchSupp && matchStat && matchSeller;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="9">Nenhuma parcela registrada para os filtros selecionados.</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(inst => {
    const supp = suppliers.find(s => s.id.toString() === inst.supplierId.toString());
    const clientNames = (inst.clientIds || []).map(cid => {
      const c = clients.find(cl => cl.id.toString() === cid.toString());
      return c ? c.name : 'Cliente';
    }).join(', ');

    const isPaid = inst.status === 'PAID';
    let statusBadge = '<span class="badge badge-green">Quitado</span>';

    if (!isPaid) {
      if (inst.dueDateIso) {
        if (inst.dueDateIso < todayStr) {
          statusBadge = '<span class="badge badge-danger">🔴 Vencida (Inadimplente)</span>';
        } else if (inst.dueDateIso <= fiveDaysStr) {
          statusBadge = '<span class="badge badge-amber">⚠️ Vence em breve</span>';
        } else {
          statusBadge = '<span class="badge badge-blue">🔵 A vencer</span>';
        }
      } else {
        statusBadge = '<span class="badge badge-amber">Pendente</span>';
      }
    }

    const actionBtn = isPaid
      ? `<div style="display: flex; gap: 4px;"><button class="btn-secondary" onclick="toggleInstallmentStatus(${inst.id})">Estornar</button><button class="btn-secondary" style="background-color: #25d366; color: white;" onclick="sendInstallmentWhatsApp(${inst.id})" title="Enviar Cobrança WhatsApp">💬</button></div>`
      : `<div style="display: flex; gap: 4px;"><button class="btn-primary" onclick="toggleInstallmentStatus(${inst.id})">Baixar</button><button class="btn-secondary" style="background-color: #25d366; color: white;" onclick="sendInstallmentWhatsApp(${inst.id})" title="Enviar Cobrança WhatsApp">💬</button></div>`;

    return `
      <tr>
        <td>#${inst.orderId.toString().slice(-6)}</td>
        <td>${supp ? supp.name : '-'}</td>
        <td>${clientNames}</td>
        <td>${inst.number}</td>
        <td>${inst.dueDate}</td>
        <td>${formatCurrency(inst.amount)}</td>
        <td style="color: #16a34a; font-weight: bold;">${formatCurrency(inst.commission)}</td>
        <td>${statusBadge}</td>
        <td>${actionBtn}</td>
      </tr>
    `;
  }).join('');
}

async function toggleInstallmentStatus(instId) {
  const inst = installments.find(i => i.id === instId);
  if (!inst) return;
  inst.status = inst.status === 'PAID' ? 'PENDING' : 'PAID';
  logAuditAction('BAIXA_PARCELA', `Alterou status da parcela ID #${instId} para ${inst.status}`);
  await saveUserData();
  renderAllViews();
}

function exportFinancialCSV() {
  if (installments.length === 0) {
    alert("Nenhuma parcela para exportar.");
    return;
  }
  let csvContent = "\uFEFFOrder_ID;Fornecedor;Cliente;Parcela;Vencimento;Valor_Parcela;Comissao;Status\n";
  installments.forEach(inst => {
    const supp = suppliers.find(s => s.id.toString() === inst.supplierId.toString());
    const clientNames = (inst.clientIds || []).map(cid => {
      const c = clients.find(cl => cl.id.toString() === cid.toString());
      return c ? c.name : 'Cliente';
    }).join(' / ');
    const formattedId = `="PED-${inst.orderId.toString().slice(-6)}"`;
    const formattedAmount = (inst.amount || 0).toFixed(2).replace('.', ',');
    const formattedComm = (inst.commission || 0).toFixed(2).replace('.', ',');
    csvContent += `${formattedId};${supp ? supp.name : '-'};${clientNames};${inst.number};${inst.dueDate};${formattedAmount};${formattedComm};${inst.status}\n`;
  });
  
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `financeiro_comissoes_${new Date().toISOString().slice(0,10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function getOrderIsoDate(order) {
  if (order.createdAt) {
    return order.createdAt.slice(0, 10);
  }
  if (order.date) {
    const parts = order.date.split('/');
    if (parts.length === 3) {
      return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
  }
  return '';
}

function formatDatePtBr(isoStr) {
  if (!isoStr) return '';
  const parts = isoStr.split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return isoStr;
}

function initReportDates() {
  const startDateElem = document.getElementById('reportStartDate');
  const endDateElem = document.getElementById('reportEndDate');
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');

  if (startDateElem && !startDateElem.value) {
    startDateElem.value = `${year}-${month}-01`;
  }
  if (endDateElem && !endDateElem.value) {
    const lastDay = new Date(year, now.getMonth() + 1, 0).getDate();
    endDateElem.value = `${year}-${month}-${String(lastDay).padStart(2, '0')}`;
  }
}

function renderReports() {
  initReportDates();

  const startDateVal = document.getElementById('reportStartDate')?.value || '';
  const endDateVal = document.getElementById('reportEndDate')?.value || '';
  const repSupp = document.getElementById('reportSupplier')?.value || 'ALL';
  const repSeller = document.getElementById('reportSeller')?.value || 'ALL';
  activeSellerFilter = repSeller;

  const salesTableBody = document.getElementById('reportSalesTableBody');
  const itemsTableBody = document.getElementById('reportItemsTableBody');
  if (!salesTableBody || !itemsTableBody) return;

  const filteredOrders = orders.filter(o => {
    const matchGlobal = activeGlobalCompany === 'ALL' || o.supplierId.toString() === activeGlobalCompany.toString();
    const matchSupp = repSupp === 'ALL' || o.supplierId.toString() === repSupp.toString();
    const matchSeller = !isMasterView || repSeller === 'ALL' || o.sellerEmail === repSeller;

    const orderIsoDate = getOrderIsoDate(o);
    let matchDateRange = true;
    if (startDateVal && orderIsoDate) {
      matchDateRange = matchDateRange && (orderIsoDate >= startDateVal);
    }
    if (endDateVal && orderIsoDate) {
      matchDateRange = matchDateRange && (orderIsoDate <= endDateVal);
    }

    return matchGlobal && matchSupp && matchSeller && matchDateRange;
  });

  const totalSalesVal = filteredOrders.reduce((acc, o) => acc + (o.total || 0), 0);
  const totalCommVal = filteredOrders.reduce((acc, o) => acc + (o.commissionTotal || 0), 0);

  let itemsSummaryMap = {};
  let totalItemsQtySum = 0;

  filteredOrders.forEach(o => {
    (o.items || []).forEach(i => {
      const key = i.id ? i.id.toString() : i.name;
      if (!itemsSummaryMap[key]) {
        itemsSummaryMap[key] = {
          id: i.id || '-',
          name: i.name,
          ncm: i.ncm || '-',
          totalQty: 0,
          totalVal: 0
        };
      }
      itemsSummaryMap[key].totalQty += (i.qty || 0);
      itemsSummaryMap[key].totalVal += (i.subtotal || (i.price * i.qty));
      totalItemsQtySum += (i.qty || 0);
    });
  });

  const repTotalSalesElem = document.getElementById('repTotalSales');
  const repSalesCountElem = document.getElementById('repSalesCount');
  const repTotalCommElem = document.getElementById('repTotalCommission');
  const repTotalItemsQtyElem = document.getElementById('repTotalItemsQty');

  if (repTotalSalesElem) repTotalSalesElem.innerText = formatCurrency(totalSalesVal);
  if (repSalesCountElem) repSalesCountElem.innerText = `${filteredOrders.length} pedido(s) no período`;
  if (repTotalCommElem) repTotalCommElem.innerText = formatCurrency(totalCommVal);
  if (repTotalItemsQtyElem) repTotalItemsQtyElem.innerText = `${totalItemsQtySum} unid.`;

  if (filteredOrders.length === 0) {
    salesTableBody.innerHTML = '<tr class="empty-row"><td colspan="8">Nenhum pedido encontrado para o período e filtros selecionados.</td></tr>';
  } else {
    salesTableBody.innerHTML = filteredOrders.map(o => {
      const supp = suppliers.find(s => s.id.toString() === o.supplierId.toString());
      const clientNames = (o.clientIds || []).map(cid => {
        const c = clients.find(cl => cl.id.toString() === cid.toString());
        return c ? c.name : 'Cliente';
      }).join(', ');
      const condText = getPaymentTermsLabel(o.paymentTerms, o.installmentsCount);
      const envioStatus = o.envioStatus === 'Enviado' 
        ? `<span class="badge badge-green">Enviado</span>` 
        : `<span class="badge badge-amber">Rascunho</span>`;

      return `
        <tr>
          <td><strong>#${o.id.toString().slice(-6)}</strong></td>
          <td>${o.date}</td>
          <td>${supp ? supp.name : '-'}</td>
          <td>${clientNames}</td>
          <td>${condText}</td>
          <td><strong>${formatCurrency(o.total)}</strong></td>
          <td style="color: #16a34a; font-weight: bold;">${formatCurrency(o.commissionTotal)}</td>
          <td>${envioStatus}</td>
        </tr>
      `;
    }).join('');
  }

  const itemsList = Object.values(itemsSummaryMap);
  if (itemsList.length === 0) {
    itemsTableBody.innerHTML = '<tr class="empty-row"><td colspan="6">Nenhum item vendido no período selecionado.</td></tr>';
  } else {
    itemsTableBody.innerHTML = itemsList.map(item => {
      const avgPrice = item.totalQty > 0 ? (item.totalVal / item.totalQty) : 0;
      return `
        <tr>
          <td>#${item.id.toString().slice(-4)}</td>
          <td><strong>${item.name}</strong></td>
          <td>${item.ncm}</td>
          <td><strong style="color: #0284c7;">${item.totalQty}</strong></td>
          <td><strong>${formatCurrency(item.totalVal)}</strong></td>
          <td>${formatCurrency(avgPrice)}</td>
        </tr>
      `;
    }).join('');
  }
}

function exportReportsCSV() {
  initReportDates();
  const startDateVal = document.getElementById('reportStartDate')?.value || '';
  const endDateVal = document.getElementById('reportEndDate')?.value || '';
  const repSupp = document.getElementById('reportSupplier')?.value || 'ALL';
  const repSeller = document.getElementById('reportSeller')?.value || 'ALL';

  const filteredOrders = orders.filter(o => {
    const matchGlobal = activeGlobalCompany === 'ALL' || o.supplierId.toString() === activeGlobalCompany.toString();
    const matchSupp = repSupp === 'ALL' || o.supplierId.toString() === repSupp.toString();
    const matchSeller = !isMasterView || repSeller === 'ALL' || o.sellerEmail === repSeller;

    const orderIsoDate = getOrderIsoDate(o);
    let matchDateRange = true;
    if (startDateVal && orderIsoDate) {
      matchDateRange = matchDateRange && (orderIsoDate >= startDateVal);
    }
    if (endDateVal && orderIsoDate) {
      matchDateRange = matchDateRange && (orderIsoDate <= endDateVal);
    }

    return matchGlobal && matchSupp && matchSeller && matchDateRange;
  });

  if (filteredOrders.length === 0) {
    alert("Nenhum dado para exportar no período selecionado.");
    return;
  }

  const periodStr = `${formatDatePtBr(startDateVal)} a ${formatDatePtBr(endDateVal)}`;
  let csvContent = `\uFEFF=== RELATÓRIO DE VENDAS (${periodStr}) ===\n`;
  csvContent += "Pedido ID;Data;Representada;Cliente;Condição;Total Pedido (R$);Comissão (R$);Status\n";

  filteredOrders.forEach(o => {
    const supp = suppliers.find(s => s.id.toString() === o.supplierId.toString());
    const clientNames = (o.clientIds || []).map(cid => {
      const c = clients.find(cl => cl.id.toString() === cid.toString());
      return c ? c.name : 'Cliente';
    }).join(' / ');
    const condText = getPaymentTermsLabel(o.paymentTerms, o.installmentsCount);
    const formattedId = `="PED-${o.id.toString().slice(-6)}"`;
    const formattedTotal = (o.total || 0).toFixed(2).replace('.', ',');
    const formattedComm = (o.commissionTotal || 0).toFixed(2).replace('.', ',');

    csvContent += `${formattedId};${o.date};${supp ? supp.name : '-'};${clientNames};${condText};${formattedTotal};${formattedComm};${o.envioStatus}\n`;
  });

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `relatorio_vendas_${startDateVal}_ate_${endDateVal}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function printSalesReportPDF() {
  initReportDates();
  const startDateVal = document.getElementById('reportStartDate')?.value || '';
  const endDateVal = document.getElementById('reportEndDate')?.value || '';
  const repSupp = document.getElementById('reportSupplier')?.value || 'ALL';
  const repSeller = document.getElementById('reportSeller')?.value || 'ALL';

  const suppObj = suppliers.find(s => s.id.toString() === repSupp.toString());
  const suppName = repSupp === 'ALL' ? 'Todas as Representadas' : (suppObj ? suppObj.name : 'Representada');

  let sellerName = 'Todos os Vendedores';
  if (repSeller !== 'ALL') {
    const seller = allSellersData.find(s => s.email === repSeller);
    if (seller) sellerName = `${seller.name} (${seller.email})`;
  }

  const filteredOrders = orders.filter(o => {
    const matchGlobal = activeGlobalCompany === 'ALL' || o.supplierId.toString() === activeGlobalCompany.toString();
    const matchSupp = repSupp === 'ALL' || o.supplierId.toString() === repSupp.toString();
    const matchSeller = !isMasterView || repSeller === 'ALL' || o.sellerEmail === repSeller;

    const orderIsoDate = getOrderIsoDate(o);
    let matchDateRange = true;
    if (startDateVal && orderIsoDate) {
      matchDateRange = matchDateRange && (orderIsoDate >= startDateVal);
    }
    if (endDateVal && orderIsoDate) {
      matchDateRange = matchDateRange && (orderIsoDate <= endDateVal);
    }

    return matchGlobal && matchSupp && matchSeller && matchDateRange;
  });

  const totalSalesVal = filteredOrders.reduce((acc, o) => acc + (o.total || 0), 0);
  const totalCommVal = filteredOrders.reduce((acc, o) => acc + (o.commissionTotal || 0), 0);

  let itemsSummaryMap = {};
  let totalItemsQtySum = 0;

  filteredOrders.forEach(o => {
    (o.items || []).forEach(i => {
      const key = i.id ? i.id.toString() : i.name;
      if (!itemsSummaryMap[key]) {
        itemsSummaryMap[key] = { id: i.id || '-', name: i.name, ncm: i.ncm || '-', totalQty: 0, totalVal: 0 };
      }
      itemsSummaryMap[key].totalQty += (i.qty || 0);
      itemsSummaryMap[key].totalVal += (i.subtotal || (i.price * i.qty));
      totalItemsQtySum += (i.qty || 0);
    });
  });

  const itemsList = Object.values(itemsSummaryMap);
  const periodDisplayStr = `${formatDatePtBr(startDateVal)} a ${formatDatePtBr(endDateVal)}`;

  const printWindow = window.open('', '_blank', 'width=950,height=800');
  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Relatório de Vendas - ${periodDisplayStr}</title>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; margin: 25px; color: #1e293b; line-height: 1.4; }
          .header { text-align: center; border-bottom: 2px solid #0284c7; padding-bottom: 15px; margin-bottom: 20px; }
          .header h1 { margin: 0; color: #0f172a; font-size: 24px; }
          .filters-info { background: #f8fafc; padding: 12px 16px; border-radius: 8px; font-size: 13px; margin-bottom: 20px; border: 1px solid #cbd5e1; }
          .metrics-grid { display: flex; gap: 15px; margin-bottom: 25px; }
          .metric-card { flex: 1; background: #f1f5f9; padding: 15px; border-radius: 8px; border-left: 4px solid #0284c7; }
          .metric-card.green { border-left-color: #16a34a; }
          .metric-card.amber { border-left-color: #f59e0b; }
          .metric-card h3 { margin: 0 0 5px 0; font-size: 12px; text-transform: uppercase; color: #475569; }
          .metric-card p { margin: 0; font-size: 20px; font-weight: bold; color: #0f172a; }
          .section-title { font-size: 16px; font-weight: bold; margin: 25px 0 10px 0; color: #0f172a; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 12px; }
          th, td { border: 1px solid #cbd5e1; padding: 8px 10px; text-align: left; }
          th { background: #f1f5f9; font-weight: 600; color: #334155; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Relatório de Vendas e Desempenho</h1>
          <p>Gerado em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}</p>
        </div>
        <div class="filters-info">
          <strong>Período:</strong> ${periodDisplayStr} | <strong>Representada:</strong> ${suppName} | <strong>Vendedor:</strong> ${sellerName}
        </div>
        <div class="metrics-grid">
          <div class="metric-card"><h3>Faturamento</h3><p>${formatCurrency(totalSalesVal)}</p></div>
          <div class="metric-card green"><h3>Comissões</h3><p>${formatCurrency(totalCommVal)}</p></div>
          <div class="metric-card amber"><h3>Itens</h3><p>${totalItemsQtySum} unid.</p></div>
        </div>
        <div class="section-title">Vendas Consolidadas</div>
        <table>
          <thead><tr><th>Pedido</th><th>Data</th><th>Representada</th><th>Cliente</th><th>Total</th><th>Status</th></tr></thead>
          <tbody>
            ${filteredOrders.map(o => `
              <tr>
                <td>#${o.id.toString().slice(-6)}</td><td>${o.date}</td><td>${suppName}</td><td>${o.clientIds}</td>
                <td><strong>${formatCurrency(o.total)}</strong></td><td>${o.envioStatus}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => { printWindow.print(); }, 500);
}

// --- ATUALIZAÇÃO DO DASHBOARD COM CÁLCULO DE LUCRO LÍQUIDO ---
function updateDashboardMetrics() {
  const filteredOrders = orders.filter(o => activeGlobalCompany === 'ALL' || o.supplierId.toString() === activeGlobalCompany.toString());
  const filteredInstallments = installments.filter(i => activeGlobalCompany === 'ALL' || i.supplierId.toString() === activeGlobalCompany.toString());
  const filteredExpenses = expenses;

  const currentMonthStr = new Date().toISOString().slice(0, 7);
  const currentMonthOrders = filteredOrders.filter(o => {
    const iso = getOrderIsoDate(o);
    return iso.startsWith(currentMonthStr);
  });
  const currentMonthExpenses = filteredExpenses.filter(ex => ex.date && ex.date.startsWith(currentMonthStr));

  const totalSalesVal = filteredOrders.reduce((acc, o) => acc + o.total, 0);
  const monthSalesVal = currentMonthOrders.reduce((acc, o) => acc + o.total, 0);

  const totalCommVal = filteredOrders.reduce((acc, o) => acc + o.commissionTotal, 0);
  const paidInsts = filteredInstallments.filter(i => i.status === 'PAID');
  const paidCommVal = paidInsts.reduce((acc, i) => acc + i.commission, 0);
  const pendingInsts = filteredInstallments.filter(i => i.status === 'PENDING');
  const pendingCommVal = pendingInsts.reduce((acc, i) => acc + i.commission, 0);

  const monthExpensesTotal = currentMonthExpenses.reduce((acc, ex) => acc + (ex.amount || 0), 0);
  const monthNetProfit = paidCommVal - monthExpensesTotal;

  document.getElementById('dashTotalSales').innerText = formatCurrency(totalSalesVal);
  document.getElementById('dashSalesCount').innerText = `${filteredOrders.length} pedidos emitidos`;
  
  const dashMonthSalesElem = document.getElementById('dashMonthSales');
  const dashMonthCountElem = document.getElementById('dashMonthCount');
  if (dashMonthSalesElem) dashMonthSalesElem.innerText = formatCurrency(monthSalesVal);
  if (dashMonthCountElem) dashMonthCountElem.innerText = `${currentMonthOrders.length} pedidos este mês`;

  document.getElementById('dashTotalCommission').innerText = formatCurrency(totalCommVal);
  document.getElementById('dashPaidCommission').innerText = formatCurrency(paidCommVal);
  document.getElementById('dashPaidCount').innerText = `${paidInsts.length} parcelas quitadas`;
  document.getElementById('dashPendingCommission').innerText = formatCurrency(pendingCommVal);
  
  const netProfitElem = document.getElementById('dashNetProfit');
  if (netProfitElem) netProfitElem.innerText = formatCurrency(monthNetProfit);

  const goalObj = monthlyGoalsMap[activeGlobalCompany] || { target: 50000 };
  const targetGoal = goalObj.target || 50000;
  const compLabel = activeGlobalCompany === 'ALL' ? 'Todas as Representadas' : (suppliers.find(s => s.id.toString() === activeGlobalCompany.toString())?.name || 'Representada');
  
  document.getElementById('dashGoalCompanyName').innerText = compLabel;
  document.getElementById('dashGoalAchieved').innerText = formatCurrency(monthSalesVal);
  document.getElementById('dashGoalTarget').innerText = `Meta: ${formatCurrency(targetGoal)}`;
  
  const percentage = targetGoal > 0 ? Math.min(100, (monthSalesVal / targetGoal) * 100) : 0;
  document.getElementById('dashGoalProgressBar').style.width = `${percentage}%`;
  document.getElementById('dashGoalPercentage').innerText = `${percentage.toFixed(1)}% da meta atingida`;

  renderDashboardCharts(filteredOrders);
}

function renderDashboardCharts(filteredOrders) {
  let productQtyMap = {};
  filteredOrders.forEach(o => {
    (o.items || []).forEach(i => {
      productQtyMap[i.name] = (productQtyMap[i.name] || 0) + i.qty;
    });
  });
  const sortedProds = Object.entries(productQtyMap).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const ctxTopProd = document.getElementById('chartTopProducts')?.getContext('2d');
  if (ctxTopProd) {
    if (chartTopProductsInstance) chartTopProductsInstance.destroy();
    chartTopProductsInstance = new Chart(ctxTopProd, {
      type: 'bar',
      data: {
        labels: sortedProds.map(p => p[0]),
        datasets: [{ label: 'Qtd Vendida', data: sortedProds.map(p => p[1]), backgroundColor: '#0284c7' }]
      },
      options: { responsive: true, plugins: { legend: { display: false } } }
    });
  }

  let clientRevenueMap = {};
  filteredOrders.forEach(o => {
    (o.clientIds || []).forEach(cid => {
      const c = clients.find(cl => cl.id.toString() === cid.toString());
      const cName = c ? c.name : 'Cliente';
      clientRevenueMap[cName] = (clientRevenueMap[cName] || 0) + o.total;
    });
  });
  const sortedClients = Object.entries(clientRevenueMap).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const ctxTopClient = document.getElementById('chartTopClients')?.getContext('2d');
  if (ctxTopClient) {
    if (chartTopClientsInstance) chartTopClientsInstance.destroy();
    chartTopClientsInstance = new Chart(ctxTopClient, {
      type: 'doughnut',
      data: {
        labels: sortedClients.map(c => c[0]),
        datasets: [{ data: sortedClients.map(c => c[1]), backgroundColor: ['#0284c7', '#16a34a', '#f59e0b', '#8b5cf6', '#ec4899'] }]
      },
      options: { responsive: true }
    });
  }

  let monthlyRevMap = {};
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const mStr = d.toISOString().slice(0, 7);
    monthlyRevMap[mStr] = 0;
  }

  filteredOrders.forEach(o => {
    const iso = getOrderIsoDate(o);
    if (!iso) return;
    const mStr = iso.slice(0, 7);
    monthlyRevMap[mStr] = (monthlyRevMap[mStr] || 0) + o.total;
  });

  const revLabels = Object.keys(monthlyRevMap).map(m => {
    const [y, mes] = m.split('-');
    return `${mes}/${y}`;
  });
  const revValues = Object.values(monthlyRevMap);

  const ctxRev = document.getElementById('chartRevenueEvolution')?.getContext('2d');
  if (ctxRev) {
    if (chartRevenueEvolutionInstance) chartRevenueEvolutionInstance.destroy();
    chartRevenueEvolutionInstance = new Chart(ctxRev, {
      type: 'line',
      data: {
        labels: revLabels,
        datasets: [{ label: 'Faturamento (R$)', data: revValues, borderColor: '#16a34a', backgroundColor: 'rgba(22, 163, 74, 0.1)', fill: true, tension: 0.3 }]
      },
      options: { responsive: true, scales: { y: { beginAtZero: true } } }
    });
  }
}

// --- GESTÃO DE USUÁRIOS E PERMISSÃO POR REPRESENTADA (ADMIN) ---
async function openAdminModal() {
  document.getElementById('adminModal').classList.remove('hidden');
  await renderUsersAdminTable();
}

function closeAdminModal() {
  document.getElementById('adminModal').classList.add('hidden');
}

async function renderUsersAdminTable() {
  const tbody = document.getElementById('usersAdminTableBody');
  tbody.innerHTML = '<tr><td colspan="6">Carregando usuários...</td></tr>';
  try {
    const snap = await db.collection('usuarios').get();
    let html = '';
    
    snap.forEach(docSnap => {
      const u = docSnap.data();
      const statusClass = u.status === 'ATIVO' ? 'badge-green' : 'badge-amber';
      const perfilAtual = u.perfil || 'vendedor';
      const liberadas = u.representadasLiberadas || [];

      let badgeColor = 'badge-amber';
      if (perfilAtual === 'admin') badgeColor = 'badge-green';
      if (perfilAtual === 'gerente') badgeColor = 'badge-blue';

      let representadasCheckboxes = `<div style="max-height: 80px; overflow-y: auto; font-size: 0.8rem; border: 1px solid #cbd5e1; padding: 4px; border-radius: 4px;">`;
      if (suppliers.length === 0) {
        representadasCheckboxes += `Nenhuma representada cadastrada`;
      } else {
        suppliers.forEach(s => {
          const isChecked = liberadas.includes(s.id.toString()) ? 'checked' : '';
          representadasCheckboxes += `<label style="display: block; font-weight: normal; cursor: pointer;"><input type="checkbox" value="${s.id}" ${isChecked} onchange="updateUserRepresentadas('${u.uid}', this)"> ${s.name}</label>`;
        });
      }
      representadasCheckboxes += `</div>`;

      html += `
        <tr>
          <td><strong>${u.nome || '-'}</strong></td>
          <td>${u.email}</td>
          <td><span class="badge ${badgeColor}">${perfilAtual.toUpperCase()}</span></td>
          <td><span class="badge ${statusClass}">${u.status}</span></td>
          <td>${representadasCheckboxes}</td>
          <td>
            <div style="display: flex; gap: 4px; align-items: center; flex-wrap: nowrap;">
              ${u.status === 'PENDENTE' ? `<button class="btn-primary" onclick="updateUserStatus('${u.uid}', 'ATIVO')">Aprovar</button>` : ''}
              ${u.status === 'ATIVO' ? `<button class="btn-danger" onclick="updateUserStatus('${u.uid}', 'BLOQUEADO')">Bloquear</button>` : ''}
              ${u.status === 'BLOQUEADO' ? `<button class="btn-primary" onclick="updateUserStatus('${u.uid}', 'ATIVO')">Desbloquear</button>` : ''}
              
              <button class="btn-secondary" onclick="updateUserPerfil('${u.uid}', 'vendedor')">Vendedor</button>
              <button class="btn-secondary" style="background-color: #0284c7; color: white;" onclick="updateUserPerfil('${u.uid}', 'gerente')">Gerente</button>
            </div>
          </td>
        </tr>
      `;
    });
    tbody.innerHTML = html || '<tr><td colspan="6">Nenhum usuário cadastrado.</td></tr>';
  } catch (error) {
    tbody.innerHTML = '<tr><td colspan="6">Erro ao carregar usuários.</td></tr>';
  }
}

async function updateUserRepresentadas(uid, checkboxElem) {
  try {
    const userDocRef = db.collection('usuarios').doc(uid);
    const docSnap = await userDocRef.get();
    if (!docSnap.exists) return;

    let liberadas = docSnap.data().representadasLiberadas || [];
    const suppId = checkboxElem.value;

    if (checkboxElem.checked) {
      if (!liberadas.includes(suppId)) liberadas.push(suppId);
    } else {
      liberadas = liberadas.filter(id => id !== suppId);
    }

    await userDocRef.update({ representadasLiberadas: liberadas });
  } catch (error) {
    alert("Erro ao atualizar representadas liberadas: " + error.message);
  }
}

async function updateUserPerfil(uid, newPerfil) {
  try {
    await db.collection('usuarios').doc(uid).update({ perfil: newPerfil });
    alert(`Perfil alterado para ${newPerfil.toUpperCase()} com sucesso!`);
    await renderUsersAdminTable();
  } catch (error) {
    alert("Erro ao alterar perfil: " + error.message);
  }
}

async function updateUserStatus(uid, newStatus) {
  try {
    await db.collection('usuarios').doc(uid).update({ status: newStatus });
    alert(`Status alterado para ${newStatus}`);
    await renderUsersAdminTable();
  } catch (error) {
    alert("Erro ao alterar status: " + error.message);
  }
}

function formatCurrency(value) {
  return (value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function exportDataBackup() {
  const backupData = { suppliers, clients, products, orders, installments, expenses, auditLogs, monthlyGoalsMap, representativeLogoUrl };
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupData));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", `backup_vendas_${currentUser ? currentUser.name : 'data'}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}

function importDataBackup(event) {
  const fileReader = new FileReader();
  fileReader.onload = async function(e) {
    try {
      const data = JSON.parse(e.target.result);
      if (data.suppliers && data.clients) {
        suppliers = data.suppliers || [];
        clients = data.clients || [];
        products = data.products || [];
        orders = data.orders || [];
        installments = data.installments || [];
        expenses = data.expenses || [];
        auditLogs = data.auditLogs || [];
        monthlyGoalsMap = data.monthlyGoalsMap || {};
        representativeLogoUrl = data.representativeLogoUrl || '';
        await saveUserData();
        loadUserData();
        alert("Backup importado com sucesso!");
      }
    } catch (err) {
      alert("Arquivo de backup inválido.");
    }
  };
  fileReader.readAsText(event.target.files[0]);
}
