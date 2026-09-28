/**
 * Dialogues favoris : mot de passe, nom, mise à jour / nouveau.
 */

export type FavoriSaveChoice = 'update' | 'new';

export type FavoriDialogResult =
  | { kind: 'cancel' }
  | { kind: 'save'; nom: string; password: string; choice: FavoriSaveChoice };

export function openFavoriDialog(opts: {
  defaultName: string;
  existingName: string | null;
  storedPassword: string | null;
  errorMessage?: string | null;
}): Promise<FavoriDialogResult> {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'favori-dialog';
    dialog.dataset.testid = 'favori-dialog';

    const title = document.createElement('h2');
    title.textContent = opts.existingName ? 'Mettre à jour le favori' : 'Enregistrer un favori';

    const err = document.createElement('p');
    err.className = 'favori-dialog-error';
    err.dataset.testid = 'favori-dialog-error';
    err.hidden = !opts.errorMessage;
    err.textContent = opts.errorMessage ?? '';

    const nameLabel = document.createElement('label');
    nameLabel.textContent = 'Nom';
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.maxLength = 80;
    nameInput.dataset.testid = 'favori-name';
    nameInput.value = opts.defaultName;
    nameLabel.appendChild(nameInput);

    const pwdLabel = document.createElement('label');
    pwdLabel.textContent = 'Mot de passe';
    const pwdInput = document.createElement('input');
    pwdInput.type = 'password';
    pwdInput.dataset.testid = 'favori-password';
    pwdInput.autocomplete = 'current-password';
    if (opts.storedPassword) pwdInput.value = opts.storedPassword;
    pwdLabel.appendChild(pwdInput);

    const actions = document.createElement('div');
    actions.className = 'favori-dialog-actions';

    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.dataset.testid = 'favori-cancel';
    cancel.textContent = 'Annuler';

    const finish = (result: FavoriDialogResult): void => {
      dialog.close();
      dialog.remove();
      resolve(result);
    };

    cancel.addEventListener('click', () => finish({ kind: 'cancel' }));

    if (opts.existingName) {
      const updateBtn = document.createElement('button');
      updateBtn.type = 'button';
      updateBtn.dataset.testid = 'favori-update';
      updateBtn.textContent = `Mettre à jour « ${opts.existingName} »`;
      updateBtn.addEventListener('click', () => {
        const nom = nameInput.value.trim() || opts.existingName!;
        const password = pwdInput.value;
        if (!password) {
          err.hidden = false;
          err.textContent = 'Mot de passe requis.';
          return;
        }
        finish({ kind: 'save', nom, password, choice: 'update' });
      });

      const newBtn = document.createElement('button');
      newBtn.type = 'button';
      newBtn.dataset.testid = 'favori-save-new';
      newBtn.textContent = 'Enregistrer comme nouveau';
      newBtn.addEventListener('click', () => {
        const nom = nameInput.value.trim();
        const password = pwdInput.value;
        if (!nom) {
          err.hidden = false;
          err.textContent = 'Indiquez un nom.';
          return;
        }
        if (!password) {
          err.hidden = false;
          err.textContent = 'Mot de passe requis.';
          return;
        }
        finish({ kind: 'save', nom, password, choice: 'new' });
      });
      actions.append(cancel, updateBtn, newBtn);
    } else {
      const save = document.createElement('button');
      save.type = 'button';
      save.dataset.testid = 'favori-save';
      save.textContent = 'Enregistrer';
      save.addEventListener('click', () => {
        const nom = nameInput.value.trim();
        const password = pwdInput.value;
        if (!nom) {
          err.hidden = false;
          err.textContent = 'Indiquez un nom.';
          return;
        }
        if (!password) {
          err.hidden = false;
          err.textContent = 'Mot de passe requis.';
          return;
        }
        finish({ kind: 'save', nom, password, choice: 'new' });
      });
      actions.append(cancel, save);
    }

    dialog.append(title, err, nameLabel, pwdLabel, actions);
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      finish({ kind: 'cancel' });
    });
    document.body.appendChild(dialog);
    dialog.showModal();
    nameInput.focus();
  });
}
