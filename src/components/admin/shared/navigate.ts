/**
 * Leaves the page for `url` with a full load, replacing it in the history. Used where the session
 * cookie has just changed (login, logout): the next page is rendered afresh with it, and no client
 * navigation is left racing a refresh of the page being left.
 */
export function reloadTo(url: string) {
  window.location.replace(url);
}
