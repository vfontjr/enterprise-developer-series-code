SELECT * FROM `wp_posts` t1
    LEFT JOIN `wp_postmeta` t2
    ON t1.id = t2.post_id AND t1.post_type = "frm_display";