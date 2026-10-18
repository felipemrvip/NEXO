# Ativação do acesso por convite — NEXO

Esta alteração foi desenvolvida em branch separada. **Não publique o frontend antes das regras do Firestore.**

## Administrador
- Conta Google verificada: `felipemrvip@gmail.com`
- Projeto Firebase existente: `nexo-4142e`
- Somente o administrador pode listar, criar, bloquear e reativar convites.
- Os convites autorizam acesso por e-mail; **não enviam e-mail automaticamente**. Compartilhe o link do NEXO com o convidado.

## Ordem de ativação (obrigatória)
1. Faça um backup JSON dos dados do NEXO atual antes de prosseguir.
2. Acesse [Firebase Console](https://console.firebase.google.com/project/nexo-4142e/firestore/rules) com uma conta que administre o projeto.
3. Copie integralmente o conteúdo de `firestore.rules` desta branch, substitua as regras do banco **Cloud Firestore**, confira no editor e clique em **Publicar**.
4. Verifique se a publicação foi concluída com sucesso. As novas regras exigem o convite ativo para qualquer usuário não administrador.
5. Só então faça o merge desta branch na `main` e aguarde a publicação do GitHub Pages.
6. Abra o NEXO, entre com a conta Google do administrador, abra **Conta → Administração • Convites**, autorize o e-mail de uma pessoa conhecida.
7. Teste o login desse convidado em um navegador/dispositivo separado. Ele deve começar com dados próprios, sem visualizar seus lançamentos.
8. Bloqueie o convite e verifique se os acessos ao Firestore passam a ser negados. Com o aplicativo aberto e conectado à internet, a interface revalida o convite periodicamente.

## Migração e segurança
- O armazenamento anterior `nexo-pwa-data-v1` não é excluído. Ao entrar como administrador em um aparelho existente, seus dados locais são copiados para uma chave vinculada ao seu UID Firebase.
- Metadados de sincronização do administrador são migrados somente se o UID coincidir.
- Os convidados nunca recebem uma cópia automática dos dados do administrador.
- Cada usuário pode ler e escrever somente `users/{uid}/nexo/state` do próprio UID, se autorizado, conforme `firestore.rules`.
- O isolamento do `localStorage` separa os dados carregados pelo app, **mas não criptografa backups locais**. Não use o mesmo perfil de navegador em aparelhos compartilhados para dados financeiros sensíveis.
- A revogação é confirmada no servidor. Se um aparelho permanecer offline, informações armazenadas localmente nesse dispositivo ainda podem existir até a próxima conexão; não é uma remoção remota de dados locais.
- As regras do Firebase são aplicadas no console; editar este arquivo no GitHub **não as publica automaticamente**.
- Não coloque chaves privadas do Firebase, credenciais de banco, tokens de usuário ou segredos de API no GitHub Pages.

## Testes necessários antes do merge
- [ ] Regras publicadas e validadas no Firebase.
- [ ] Administrador faz login sem convite e visualiza o painel.
- [ ] Novo convidado autorizado faz login e não vê dados do administrador.
- [ ] Conta sem convite recebe acesso negado.
- [ ] Conta bloqueada tem acesso ao Firestore negado.
- [ ] Backup, migração e sincronização do administrador preservados.
- [ ] Testes realizados no Safari/iPhone e no computador.
