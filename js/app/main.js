// ======================================================================
// app/main.js — liga tudo
// Executa o "init" de cada módulo na MESMA ordem em que o código rodava no
// app.js original (isso preserva o comportamento). Carregado por app.js.
// ======================================================================

import { init as init_nucleo_periodos } from '../nucleo/periodos.js';
import { init as init_nucleo_config } from '../nucleo/config.js';
import { init as init_nucleo_listas_estado } from '../nucleo/listas-estado.js';
import { init as init_nucleo_dados } from '../nucleo/dados.js';
import { init as init_abas_profissionais } from '../abas/profissionais.js';
import { init as init_abas_analises_calculo } from '../abas/analises/calculo.js';
import { init as init_abas_analises_render } from '../abas/analises/render.js';
import { init as init_listas_atividade_coletiva } from '../listas/atividade-coletiva.js';
import { init as init_nucleo_popovers } from '../nucleo/popovers.js';
import { init as init_visual_gauge } from '../visual/gauge.js';
import { init as init_visual_painel_kpi } from '../visual/painel-kpi.js';
import { init as init_abas_m1_m2 } from '../abas/m1-m2.js';
import { init as init_app_render } from './render.js';
import { init as init_app_historico } from './historico.js';
import { init as init_app_carga } from './carga.js';
import { init as init_app_alinhamento_tabelas } from './alinhamento-tabelas.js';
import { init as init_app_init } from './init.js';

init_nucleo_periodos();
init_nucleo_config();
init_nucleo_listas_estado();
init_nucleo_dados();
init_abas_profissionais();
init_abas_analises_calculo();
init_abas_analises_render();
init_listas_atividade_coletiva();
init_nucleo_popovers();
init_visual_gauge();
init_visual_painel_kpi();
init_abas_m1_m2();
init_app_render();
init_app_historico();
init_app_carga();
init_app_alinhamento_tabelas();
init_app_init();
