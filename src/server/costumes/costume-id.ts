/**
 * 衣装のINSERTと同じトランザクション内で実行する採番SQL。
 * sqlite_sequenceの専用行を更新し、削除した衣装の番号も再利用しない。
 * 対応するAUTOINCREMENTテーブルは不要。専用行はDDL/移行SQLで初期化する。
 */
export const allocateCostumeIdSql = "UPDATE sqlite_sequence SET seq = seq + 1 WHERE name = 'costume_id_sequence'";
export const nextCostumeIdSql = `(
  SELECT printf('costume-%03d', seq) FROM sqlite_sequence WHERE name = 'costume_id_sequence'
)`;
