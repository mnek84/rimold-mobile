/**
 * Tinta para texto e íconos sobre las superficies naranjas grandes del mapa.
 *
 * `colors.primaryOn` es blanco, y medido sobre el naranja de marca da 4.3:1 en
 * tema claro y 2.9:1 en oscuro. Para un botón que se toca mirando no alcanza
 * con que se vea: la franja de progreso y el botón "Ir" se leen con el auto en
 * marcha y a pleno sol. Este casi-negro da 5.6:1 y 7.1:1 sobre los mismos dos
 * naranjas, que es la misma solución que usa Flex con su amarillo.
 *
 * Queda acotado a esta pantalla a propósito: corregir `primaryOn` arreglaría
 * también los botones primarios del resto de la app, pero es un cambio visual
 * transversal que merece decidirse aparte.
 */
export const ON_PRIMARY_INK = '#20100a';

/** Fondo de los controles redondos embebidos en la franja naranja. */
export const ON_PRIMARY_CONTROL_BG = 'rgba(32, 16, 10, 0.13)';
