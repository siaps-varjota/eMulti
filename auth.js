// ============================================================
// auth.js — Painel eMulti
// Login por CPF + senha, seguindo o mesmo padrão do sistema
// SESAVAR (Google Apps Script + Google Sheets).
// ============================================================

// ── Configuração do backend ──
// ASSUNÇÃO: reaproveitando o mesmo Apps Script/planilha "LOGINS"
// (ABA_USUARIOS) do Sistema de Suporte Clínico e-SUS - SESAVAR,
// já que foi o modelo enviado como referência. Se o Painel eMulti
// precisar de um backend/planilha próprios, troque só estas duas
// constantes pela URL e chave do novo Apps Script.
const URL_DO_WEB_APP = 'https://script.google.com/macros/s/AKfycbwyRSNGG3EU0avCiMxu4WEr7_sLWqqPvMQPLBKz-UD6ZALuA0hzCgcfn9BClWeoifzTUA/exec';
const CHAVE_SECRETA = 'scamander'; // precisa ser igual à do Apps Script

// Se quiser restringir o login só a certas categorias de usuário
// (ex.: só quem tem categoria "eMulti" pode entrar aqui), liste-as
// abaixo. Deixe o array vazio para não restringir por categoria.
const CATEGORIAS_PERMITIDAS = ['eMulti', 'Coordenação'];

const SESSION_KEY = 'painel_emulti_auth';
const SESSION_TTL = 8 * 60 * 60 * 1000; // 8 horas

// dados temporários entre o login e o modal de troca de senha
let sessaoTemp = null;

// ── Elementos ──
const loginOverlay = document.getElementById('loginOverlay');
const appShell = document.getElementById('appShell');
const loginForm = document.getElementById('loginForm');
const loginCpf = document.getElementById('loginCpf');
const loginSenha = document.getElementById('loginSenha');
const loginError = document.getElementById('loginError');
const loginSubmit = document.getElementById('loginSubmit');

const firstLoginModal = document.getElementById('firstLoginModal');
const firstLoginNo = document.getElementById('firstLoginNo');
const firstLoginYes = document.getElementById('firstLoginYes');

const changePasswordBackdrop = document.getElementById('changePasswordBackdrop');
const changePasswordForm = document.getElementById('changePasswordForm');
const newSenha = document.getElementById('newSenha');
const newSenhaConfirm = document.getElementById('newSenhaConfirm');
const changePasswordError = document.getElementById('changePasswordError');
const changePasswordSkip = document.getElementById('changePasswordSkip');
const changePasswordSubmit = document.getElementById('changePasswordSubmit');

// ── Sessão já ativa? pula direto pro painel ──
(function checkSession() {
  const raw = sessionStorage.getItem(SESSION_KEY);
  if (!raw) return;
  try {
    const { exp } = JSON.parse(raw);
    if (Date.now() < exp) mostrarApp();
  } catch (e) {}
})();

// ── Máscara de CPF ──
loginCpf.addEventListener('input', function (e) {
  let v = e.target.value.replace(/\D/g, '').slice(0, 11);
  v = v.replace(/(\d{3})(\d)/, '$1.$2');
  v = v.replace(/(\d{3})(\d)/, '$1.$2');
  v = v.replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  e.target.value = v;
});

// ── Comunicação com o backend ──
async function chamarBackend(corpo) {
  const resposta = await fetch(URL_DO_WEB_APP, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ chave: CHAVE_SECRETA, ...corpo }),
  });
  return resposta.json();
}

function salvarSessao(cpf, nome, categoria) {
  sessionStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ user: cpf, cpf, nome, categoria, exp: Date.now() + SESSION_TTL })
  );
}

function mostrarErro(elemento, mensagem) {
  elemento.textContent = mensagem;
  elemento.style.display = 'block';
}

function esconderErro(elemento) {
  elemento.style.display = 'none';
}

// ── Botão "mostrar/ocultar senha" ──
// Injeta o botão via JS (não depende de o HTML já ter o ícone/markup
// pronto): envolve o campo num wrapper posicionado, encosta um botão
// no canto direito e alterna o type do input entre password/text.
function adicionarToggleSenha(input) {
  if (!input || input.dataset.toggleSenha) return;
  input.dataset.toggleSenha = '1';

  const wrapper = document.createElement('div');
  wrapper.style.position = 'relative';
  input.parentNode.insertBefore(wrapper, input);
  wrapper.appendChild(input);

  input.style.boxSizing = 'border-box';
  input.style.paddingRight = '42px';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.setAttribute('aria-label', 'Mostrar senha');
  btn.tabIndex = -1;
  btn.textContent = '👁';
  btn.style.cssText =
    'position:absolute;right:6px;top:50%;transform:translateY(-50%);' +
    'background:none;border:none;cursor:pointer;font-size:16px;line-height:1;' +
    'padding:6px;color:#51605a;';
  btn.addEventListener('click', function () {
    const oculta = input.type === 'password';
    input.type = oculta ? 'text' : 'password';
    btn.textContent = oculta ? '🙈' : '👁';
    btn.setAttribute('aria-label', oculta ? 'Ocultar senha' : 'Mostrar senha');
  });
  wrapper.appendChild(btn);
}

[loginSenha, newSenha, newSenhaConfirm].forEach(adicionarToggleSenha);

// ── Botão "Sair" ──
// Procura o botão de logout (por id comum, por [data-action] ou, em
// último caso, por texto "Sair") e liga ao logoutPainelEmulti — antes
// disso o botão existia no HTML mas não tinha nenhum listener.
function ligarBotaoSair() {
  let botao =
    document.getElementById('logoutBtn') ||
    document.getElementById('btnSair') ||
    document.getElementById('sairBtn') ||
    document.querySelector('[data-action="logout"], [data-action="sair"]');

  if (!botao) {
    const escopo = appShell || document;
    const els = escopo.querySelectorAll('button, a');
    botao = Array.prototype.find.call(els, function (el) {
      return el.textContent.trim().toLowerCase() === 'sair';
    });
  }

  if (botao && !botao.dataset.logoutLigado) {
    botao.dataset.logoutLigado = '1';
    botao.addEventListener('click', function (e) {
      e.preventDefault();
      window.logoutPainelEmulti();
    });
  }
}

// ── Login ──
loginForm.addEventListener('submit', async function (e) {
  e.preventDefault();

  const cpf = loginCpf.value;
  const senha = loginSenha.value;

  esconderErro(loginError);
  loginSubmit.disabled = true;
  loginSubmit.textContent = 'Entrando...';

  try {
    const dados = await chamarBackend({ acao: 'login', cpf, senha });

    if (dados.status === 'ok') {
      if (CATEGORIAS_PERMITIDAS.length && !CATEGORIAS_PERMITIDAS.includes(dados.categoria)) {
        mostrarErro(loginError, '❌ Seu usuário não tem acesso a este painel.');
        return;
      }
      salvarSessao(dados.cpf, dados.nome, dados.categoria);
      mostrarApp();
    } else if (dados.status === 'primeiro_login') {
      sessaoTemp = { cpf, senhaAtual: senha, nome: dados.nome, categoria: dados.categoria };
      firstLoginModal.classList.remove('hidden');
    } else {
      mostrarErro(loginError, '❌ ' + (dados.mensagem || 'CPF ou senha incorretos.'));
      loginSenha.value = '';
      loginSenha.focus();
    }
  } catch (e) {
    mostrarErro(loginError, '❌ Não foi possível conectar ao servidor.');
  } finally {
    loginSubmit.disabled = false;
    loginSubmit.textContent = 'Entrar';
  }
});

// ── Modal "primeiro acesso" ──
firstLoginNo.addEventListener('click', function () {
  firstLoginModal.classList.add('hidden');
  salvarSessao(sessaoTemp.cpf, sessaoTemp.nome, sessaoTemp.categoria);
  mostrarApp();
});

firstLoginYes.addEventListener('click', function () {
  firstLoginModal.classList.add('hidden');
  changePasswordBackdrop.classList.remove('hidden');
});

// ── Modal de troca de senha ──
changePasswordSkip.addEventListener('click', function () {
  changePasswordBackdrop.classList.add('hidden');
  salvarSessao(sessaoTemp.cpf, sessaoTemp.nome, sessaoTemp.categoria);
  mostrarApp();
});

changePasswordForm.addEventListener('submit', async function (e) {
  e.preventDefault();

  const nova = newSenha.value;
  const confirmacao = newSenhaConfirm.value;

  esconderErro(changePasswordError);

  if (nova.length < 6) {
    mostrarErro(changePasswordError, 'A senha precisa ter ao menos 6 caracteres.');
    return;
  }
  if (nova !== confirmacao) {
    mostrarErro(changePasswordError, 'As senhas não coincidem.');
    return;
  }

  changePasswordSubmit.disabled = true;
  changePasswordSubmit.textContent = 'Salvando...';

  try {
    const dados = await chamarBackend({
      acao: 'alterarSenha',
      cpf: sessaoTemp.cpf,
      senhaAtual: sessaoTemp.senhaAtual,
      novaSenha: nova,
    });

    if (dados.status === 'ok') {
      changePasswordBackdrop.classList.add('hidden');
      salvarSessao(sessaoTemp.cpf, sessaoTemp.nome, sessaoTemp.categoria);
      mostrarApp();
    } else {
      mostrarErro(changePasswordError, dados.mensagem || 'Não foi possível alterar a senha.');
    }
  } catch (e) {
    mostrarErro(changePasswordError, 'Não foi possível conectar ao servidor.');
  } finally {
    changePasswordSubmit.disabled = false;
    changePasswordSubmit.textContent = 'Salvar nova senha';
  }
});

// ── Revela o painel depois do login ──
function mostrarApp() {
  loginOverlay.classList.add('hidden');
  appShell.classList.remove('hidden');

  // Se o app.js expuser uma função de inicialização, ela é chamada
  // aqui (assim o painel só carrega dados depois do login). Ajuste
  // o nome abaixo para o nome real da função em app.js, se houver.
  if (typeof window.iniciarPainelEmulti === 'function') {
    window.iniciarPainelEmulti();
  }
  ligarBotaoSair();
  window.dispatchEvent(new CustomEvent('painel-emulti:login'));
}

// ── Logout (opcional — ligue a um botão em appShell se quiser) ──
window.logoutPainelEmulti = function () {
  sessionStorage.removeItem(SESSION_KEY);
  window.location.reload();
};
